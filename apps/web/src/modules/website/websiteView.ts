import {
	rangeFromValue,
	WEB_ANALYTICS_RANGES,
	type RankedRow,
	type WebAnalyticsErrorKind,
	type WebAnalyticsRange,
	type WebAnalyticsSummary,
} from "../../../convex/lib/webAnalytics.ts";
import type { SnapshotView } from "../../../convex/websiteAnalytics.ts";
import { formatAgo } from "../../shared/time.ts";

export const RANGES = WEB_ANALYTICS_RANGES.map((days) => ({
	days,
	label: `${String(days)}d`,
}));

export const DEFAULT_RANGE: WebAnalyticsRange = 30;
const STALE_AFTER_MS = 900_000;

const REASONS: Record<WebAnalyticsErrorKind, string> = {
	rateLimited: "rate limit",
	unauthorized: "access denied",
	network: "network",
	malformed: "unexpected response",
};

export function rangeFromParameter(
	raw: string | string[] | undefined
): WebAnalyticsRange {
	return rangeFromValue(raw) ?? DEFAULT_RANGE;
}

export function isStale(fetchedAt: number | undefined, now: number): boolean {
	return fetchedAt === undefined || now - fetchedAt > STALE_AFTER_MS;
}

export function refreshedLabel(
	fetchedAt: number | undefined,
	now: number
): string {
	return fetchedAt === undefined
		? "Not refreshed yet"
		: `Refreshed ${formatAgo(fetchedAt, now)}`;
}

export function failureNotice(
	snapshot: SnapshotView["snapshot"],
	now: number
): string | undefined {
	const lastError = snapshot?.lastError;
	if (!lastError) return undefined;
	const fetchedAt = snapshot.fetchedAt;
	if (fetchedAt !== undefined && fetchedAt >= lastError.at) return undefined;
	const reason = `Couldn't refresh (${REASONS[lastError.kind]}).`;
	return fetchedAt === undefined
		? reason
		: `${reason} Showing data from ${formatAgo(fetchedAt, now)}.`;
}

export function viewsPerVisit(totals: WebAnalyticsSummary["totals"]): string {
	return totals.visits === 0
		? "—"
		: (totals.views / totals.visits).toFixed(1);
}

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

/** English name for an ISO 3166 alpha-2 code; anything else comes back as is. */
export function countryName(code: string): string {
	try {
		return REGION_NAMES.of(code) ?? code;
	} catch {
		return code;
	}
}

/** The note under the bar when the provider sampled the range, else
 *  undefined. A missing interval means exact counts. */
export function sampleNotice(
	sampleInterval: number | undefined
): string | undefined {
	return sampleInterval !== undefined && sampleInterval > 1
		? `Estimated: the provider sampled 1 in ${String(sampleInterval)} page views for this range. Shorter ranges are more exact.`
		: undefined;
}

export function topLabel(rows: RankedRow[]): string {
	return rows[0]?.label ?? "—";
}

export function withShare(
	rows: RankedRow[],
	total: number
): (RankedRow & { share: number })[] {
	return rows.map((row) => ({
		...row,
		share: total === 0 ? 0 : row.count / total,
	}));
}
