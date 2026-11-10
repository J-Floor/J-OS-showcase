import { describe, expect, it } from "vitest";

import {
	FakeWebAnalyticsProvider,
	sampleSummary,
} from "./fakeWebAnalyticsProvider.ts";

describe("FakeWebAnalyticsProvider", () => {
	it("returns its summary and records the call", async () => {
		const provider = new FakeWebAnalyticsProvider();
		const result = await provider.summary(30, 1_000);
		expect(result.isOk() && result.value).toEqual(sampleSummary());
		expect(provider.calls).toEqual([{ range: 30, now: 1_000 }]);
	});

	it("fails with the configured error", async () => {
		const provider = new FakeWebAnalyticsProvider();
		provider.failure = { kind: "rateLimited" };
		const result = await provider.summary(7, 1_000);
		expect(result.isErr() && result.error).toEqual({ kind: "rateLimited" });
	});
});
