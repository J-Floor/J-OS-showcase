// Web analytics for the public site: what a provider returns and how the app
// stores it. Vendor details live in the one adapter that implements
// `WebAnalyticsProvider`.
import { v, type Infer } from "convex/values";
import type { ResultAsync } from "neverthrow";

/* eslint-disable @typescript-eslint/no-magic-numbers -- the range literals are the ranges' values */
export const WEB_ANALYTICS_RANGES = [7, 30, 90] as const;
/* eslint-enable @typescript-eslint/no-magic-numbers -- end of range literals */
export const webAnalyticsRangeValidator = v.union(
	...WEB_ANALYTICS_RANGES.map((days) => v.literal(days))
);
export type WebAnalyticsRange = Infer<typeof webAnalyticsRangeValidator>;

/** The range a raw value names, or undefined when it names none. */
export function rangeFromValue(
	raw: string | string[] | null | undefined
): WebAnalyticsRange | undefined {
	return WEB_ANALYTICS_RANGES.find((days) => String(days) === raw);
}

export const REFRESH_GUARD_MS = 60_000;

/** When the range was last attempted, successfully or not; 0 if never. */
function lastAttemptAt(snapshot: { attemptedAt?: number } | null): number {
	return snapshot?.attemptedAt ?? 0;
}

/** The moment a refresh of the range is allowed again. */
export function refreshOpensAt(
	snapshot: { attemptedAt?: number } | null
): number {
	return lastAttemptAt(snapshot) + REFRESH_GUARD_MS;
}

export const BREAKDOWN_KEYS = [
	"pages",
	"referrers",
	"countries",
	"devices",
	"browsers",
	"os",
] as const;
export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];

const rankedRowValidator = v.object({ label: v.string(), count: v.number() });
export type RankedRow = Infer<typeof rankedRowValidator>;

export const webAnalyticsSummaryValidator = v.object({
	totals: v.object({ views: v.number(), visits: v.number() }),
	daily: v.array(
		v.object({ date: v.string(), views: v.number(), visits: v.number() })
	),
	sampleInterval: v.optional(v.number()),
	pages: v.array(rankedRowValidator),
	referrers: v.array(rankedRowValidator),
	countries: v.array(rankedRowValidator),
	devices: v.array(rankedRowValidator),
	browsers: v.array(rankedRowValidator),
	os: v.array(rankedRowValidator),
});
export type WebAnalyticsSummary = Infer<typeof webAnalyticsSummaryValidator>;

export const webAnalyticsErrorKindValidator = v.union(
	v.literal("rateLimited"),
	v.literal("unauthorized"),
	v.literal("network"),
	v.literal("malformed")
);
export type WebAnalyticsErrorKind = Infer<
	typeof webAnalyticsErrorKindValidator
>;
export const webAnalyticsFailureValidator = v.object({
	at: v.number(),
	kind: webAnalyticsErrorKindValidator,
});
export type WebAnalyticsError = { kind: WebAnalyticsErrorKind };

/** One analytics vendor: the site's traffic over the `range` days ending on
 *  `now`'s UTC date. */
export type WebAnalyticsProvider = {
	summary(
		range: WebAnalyticsRange,
		now: number
	): ResultAsync<WebAnalyticsSummary, WebAnalyticsError>;
};

let injectedProvider: WebAnalyticsProvider | undefined;

// dry-ignore -- one-line test seam, same shape as the email and door providers'
export function setWebAnalyticsProviderForTests(
	provider: WebAnalyticsProvider | undefined
): void {
	injectedProvider = provider;
}

export function injectedWebAnalyticsProvider():
	WebAnalyticsProvider | undefined {
	return injectedProvider;
}
