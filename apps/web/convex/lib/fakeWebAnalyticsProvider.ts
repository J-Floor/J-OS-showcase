// In-memory WebAnalyticsProvider for tests. A real module (not inline in a
// test) so every test that injects a provider shares one fake.
import { errAsync, okAsync, type ResultAsync } from "neverthrow";

import type {
	WebAnalyticsError,
	WebAnalyticsProvider,
	WebAnalyticsRange,
	WebAnalyticsSummary,
} from "./webAnalytics.ts";

export function sampleSummary(): WebAnalyticsSummary {
	return {
		totals: { views: 120, visits: 80 },
		sampleInterval: 1,
		daily: [
			{ date: "2026-11-09", views: 50, visits: 30 },
			{ date: "2026-11-10", views: 70, visits: 50 },
		],
		pages: [
			{ label: "/", count: 90 },
			{ label: "/contact", count: 30 },
		],
		referrers: [{ label: "example.com", count: 12 }],
		countries: [
			{ label: "CH", count: 70 },
			{ label: "DE", count: 20 },
		],
		devices: [{ label: "desktop", count: 80 }],
		browsers: [{ label: "Chrome", count: 60 }],
		os: [{ label: "macOS", count: 40 }],
	};
}

export class FakeWebAnalyticsProvider implements WebAnalyticsProvider {
	result: WebAnalyticsSummary = sampleSummary();
	/** When set, every call fails with this error. */
	failure: WebAnalyticsError | undefined;
	calls: { range: WebAnalyticsRange; now: number }[] = [];

	summary(
		range: WebAnalyticsRange,
		now: number
	): ResultAsync<WebAnalyticsSummary, WebAnalyticsError> {
		this.calls.push({ range, now });
		return this.failure ? errAsync(this.failure) : okAsync(this.result);
	}
}
