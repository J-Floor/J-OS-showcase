// The Cloudflare Web Analytics adapter: the only file that knows the vendor.
// One GraphQL request with an aliased node per panel. Each node counts as one
// query against the vendor's 300-per-5-minutes budget, which is why
// `websiteAnalytics.refresh` caches and guards.
//
// No "use node": a pure fetch client, fine in the default Convex runtime.
import { err, ok, ResultAsync, type Result } from "neverthrow";

import { DAY_MS } from "./constants.ts";
import { ISO_DATE_LENGTH } from "./time.ts";
import {
	BREAKDOWN_KEYS,
	WEB_ANALYTICS_RANGES,
	type BreakdownKey,
	type RankedRow,
	type WebAnalyticsError,
	type WebAnalyticsProvider,
	type WebAnalyticsRange,
	type WebAnalyticsSummary,
} from "./webAnalytics.ts";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const TOP_ROWS = 10;
const FETCH_TIMEOUT_MS = 15_000;
const DAILY_LIMIT = Math.max(...WEB_ANALYTICS_RANGES);
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const DIRECT_LABEL = "Direct";
const UNKNOWN_LABEL = "Unknown";
const SITE_HOST = "thejfloor.com";

export type AnalyticsDeps = {
	fetch: typeof fetch;
	token: string;
	accountId: string;
	host: string;
};

const BREAKDOWNS: Record<BreakdownKey, string> = {
	pages: "requestPath",
	referrers: "refererHost",
	countries: "countryName",
	devices: "deviceType",
	browsers: "userAgentBrowser",
	os: "userAgentOS",
};

const FILTER =
	"filter: { AND: [{ requestHost: $host }, { date_geq: $start }, { date_leq: $end }] }";

function breakdownNode(alias: BreakdownKey): string {
	return `${alias}: rumPageloadEventsAdaptiveGroups(${FILTER}, limit: ${TOP_ROWS}, orderBy: [count_DESC]) { count dimensions { metric: ${BREAKDOWNS[alias]} } }`;
}

const QUERY = `query SiteSummary($accountTag: string!, $host: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      totals: rumPageloadEventsAdaptiveGroups(${FILTER}, limit: 1) { count sum { visits } avg { sampleInterval } }
      daily: rumPageloadEventsAdaptiveGroups(${FILTER}, limit: ${DAILY_LIMIT}, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
      ${BREAKDOWN_KEYS.map((alias) => breakdownNode(alias)).join("\n      ")}
    }
  }
}`;

function isoDate(ms: number): string {
	return new Date(ms).toISOString().slice(0, ISO_DATE_LENGTH);
}

/** The `range` UTC dates ending on `now`'s date, oldest first. */
export function dateWindow(
	range: WebAnalyticsRange,
	now: number
): { start: string; end: string; days: string[] } {
	const days = Array.from({ length: range }, (_, index) =>
		isoDate(now - (range - 1 - index) * DAY_MS)
	);
	return { start: days[0], end: days[days.length - 1], days };
}

type Group = {
	count: number;
	sum?: { visits: number };
	avg?: { sampleInterval?: number };
	dimensions?: { metric?: string; date?: string };
};

function isGroupList(value: unknown): value is Group[] {
	return (
		Array.isArray(value) &&
		value.every(
			(entry) =>
				typeof entry === "object" &&
				entry !== null &&
				typeof (entry as { count?: unknown }).count === "number"
		)
	);
}

function ranked(groups: Group[], alias: BreakdownKey): RankedRow[] {
	return groups.map((group) => {
		const raw = group.dimensions?.metric ?? "";
		const fallback = alias === "referrers" ? DIRECT_LABEL : UNKNOWN_LABEL;
		return { label: raw === "" ? fallback : raw, count: group.count };
	});
}

function rankedEntries(
	nodes: Record<string, Group[]>
): Record<BreakdownKey, RankedRow[]> {
	return Object.fromEntries(
		BREAKDOWN_KEYS.map((key) => [key, ranked(nodes[key], key)])
	) as Record<BreakdownKey, RankedRow[]>;
}

function totalsOf(total: Group | undefined) {
	return {
		counts: { views: total?.count ?? 0, visits: total?.sum?.visits ?? 0 },
		sampleInterval: total?.avg?.sampleInterval ?? 1,
	};
}

function toSummary(
	account: Record<string, unknown>,
	days: string[]
): Result<WebAnalyticsSummary, WebAnalyticsError> {
	const nodes: Record<string, Group[]> = {};
	for (const key of ["totals", "daily", ...BREAKDOWN_KEYS]) {
		const value = account[key];
		if (!isGroupList(value)) return err({ kind: "malformed" });
		nodes[key] = value;
	}
	const total = nodes.totals.at(0);
	const totals = totalsOf(total);
	const byDate = new Map(
		nodes.daily.map((group) => [group.dimensions?.date, group])
	);
	return ok({
		totals: totals.counts,
		sampleInterval: totals.sampleInterval,
		daily: days.map((date) => {
			const group = byDate.get(date);
			return {
				date,
				views: group?.count ?? 0,
				visits: group?.sum?.visits ?? 0,
			};
		}),
		...rankedEntries(nodes),
	});
}

type GraphQLError = { message?: string; extensions?: { code?: string } };

function graphQLFailure(errors: GraphQLError[]): WebAnalyticsError {
	if (errors.some((error) => error.extensions?.code === "budget"))
		return { kind: "rateLimited" };
	if (
		errors.some((error) =>
			/authenticat|authoriz/i.test(error.message ?? "")
		)
	)
		return { kind: "unauthorized" };
	return { kind: "malformed" };
}

function statusFailure(status: number): WebAnalyticsError | undefined {
	if (status === HTTP_TOO_MANY_REQUESTS) return { kind: "rateLimited" };
	if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN)
		return { kind: "unauthorized" };
	if (status >= HTTP_BAD_REQUEST) return { kind: "network" };
	return undefined;
}

function parse(
	body: unknown,
	days: string[]
): Result<WebAnalyticsSummary, WebAnalyticsError> {
	if (typeof body !== "object" || body === null)
		return err({ kind: "malformed" });
	const { data, errors } = body as {
		data?: { viewer?: { accounts?: unknown[] } } | null;
		errors?: GraphQLError[] | null;
	};
	if (Array.isArray(errors) && errors.length > 0)
		return err(graphQLFailure(errors));
	const account = data?.viewer?.accounts?.[0];
	return typeof account !== "object" || account === null
		? err({ kind: "malformed" })
		: toSummary(account as Record<string, unknown>, days);
}

async function fetchSummary(
	deps: AnalyticsDeps,
	range: WebAnalyticsRange,
	now: number
): Promise<Result<WebAnalyticsSummary, WebAnalyticsError>> {
	const window = dateWindow(range, now);
	const sent = await ResultAsync.fromPromise(
		deps.fetch(ENDPOINT, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${deps.token}`,
				"Content-Type": "application/json",
			},
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			body: JSON.stringify({
				query: QUERY,
				variables: {
					accountTag: deps.accountId,
					host: deps.host,
					start: window.start,
					end: window.end,
				},
			}),
		}),
		(): WebAnalyticsError => ({ kind: "network" })
	);
	if (sent.isErr()) return err(sent.error);
	const failure = statusFailure(sent.value.status);
	if (failure) return err(failure);
	const body = await ResultAsync.fromPromise(
		sent.value.json() as Promise<unknown>,
		(error): WebAnalyticsError => ({
			kind:
				error instanceof DOMException &&
				(error.name === "AbortError" || error.name === "TimeoutError")
					? "network"
					: "malformed",
		})
	);
	return body.isErr() ? err(body.error) : parse(body.value, window.days);
}

export function analyticsProvider(deps: AnalyticsDeps): WebAnalyticsProvider {
	return {
		summary: (range, now) =>
			new ResultAsync(fetchSummary(deps, range, now)),
	};
}

/** The adapter built from this deployment's env, or undefined when either
 *  setting is missing. */
export function webAnalyticsFromEnvironment():
	WebAnalyticsProvider | undefined {
	const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	return token && accountId
		? analyticsProvider({ fetch, token, accountId, host: SITE_HOST })
		: undefined;
}
