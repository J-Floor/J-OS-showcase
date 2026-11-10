import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import {
	FakeWebAnalyticsProvider,
	sampleSummary,
} from "./lib/fakeWebAnalyticsProvider.ts";
import { setWebAnalyticsProviderForTests } from "./lib/webAnalytics.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const BOARD = { email: "board@example.com" };
const MEMBER = { email: "member@example.com" };

async function seed() {
	const backend = convexTest(schema, modules);
	await backend.run(async (context) => {
		for (const [email, tier] of [
			[BOARD.email, "board"],
			[MEMBER.email, "member"],
		] as const) {
			await context.db.insert("people", {
				email,
				firstName: "Test",
				lastName: tier,
				tier,
				stage: "active",
				stageSince: Date.now(),
			});
		}
	});
	return backend;
}

let provider: FakeWebAnalyticsProvider;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(Date.UTC(2026, 10, 10, 12));
	provider = new FakeWebAnalyticsProvider();
	setWebAnalyticsProviderForTests(provider);
});

afterEach(() => {
	setWebAnalyticsProviderForTests(undefined);
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("websiteAnalytics", () => {
	it("refuses a member on the query and the action", async () => {
		const backend = await seed();
		const member = backend.withIdentity(MEMBER);
		await expect(
			member.query(api.websiteAnalytics.snapshot, { days: 30 })
		).rejects.toThrow();
		await expect(
			member.action(api.websiteAnalytics.refresh, { days: 30 })
		).rejects.toThrow();
		expect(provider.calls).toHaveLength(0);
	});

	it("starts with no snapshot", async () => {
		const backend = await seed();
		const view = await backend
			.withIdentity(BOARD)
			.query(api.websiteAnalytics.snapshot, { days: 30 });
		expect(view).toEqual({ days: 30, configured: true, snapshot: null });
	});

	it("refresh stores the summary for that range", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 7 })
		).toEqual({ kind: "refreshed" });
		const view = await board.query(api.websiteAnalytics.snapshot, {
			days: 7,
		});
		expect(view.snapshot?.summary).toEqual(sampleSummary());
		expect(view.snapshot?.fetchedAt).toBe(Date.now());
		expect(provider.calls).toEqual([{ range: 7, now: Date.now() }]);
	});

	it("skips a second refresh within the guard window", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		vi.advanceTimersByTime(59_000);
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 30 })
		).toEqual({ kind: "skipped" });
		expect(provider.calls).toHaveLength(1);
		vi.advanceTimersByTime(2_000);
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 30 })
		).toEqual({ kind: "refreshed" });
		expect(provider.calls).toHaveLength(2);
	});

	it("lets only one of two concurrent refreshes fetch", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		const outcomes = await Promise.all([
			board.action(api.websiteAnalytics.refresh, { days: 30 }),
			board.action(api.websiteAnalytics.refresh, { days: 30 }),
		]);
		expect(outcomes).toContainEqual({ kind: "refreshed" });
		expect(outcomes).toContainEqual({ kind: "skipped" });
		expect(provider.calls).toHaveLength(1);
	});

	it("does not guard one range with another range's fetch", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 90 })
		).toEqual({ kind: "refreshed" });
	});

	it("keeps the old summary and records the error on failure", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		const firstFetch = Date.now();
		vi.advanceTimersByTime(61_000);
		provider.failure = { kind: "rateLimited" };
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 30 })
		).toEqual({ kind: "failed", error: "rateLimited" });
		const view = await board.query(api.websiteAnalytics.snapshot, {
			days: 30,
		});
		expect(view.snapshot?.summary).toEqual(sampleSummary());
		expect(view.snapshot?.fetchedAt).toBe(firstFetch);
		expect(view.snapshot?.lastError).toEqual({
			at: Date.now(),
			kind: "rateLimited",
		});
	});

	it("records a first-ever failure without a summary", async () => {
		const backend = await seed();
		provider.failure = { kind: "network" };
		const board = backend.withIdentity(BOARD);
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		const view = await board.query(api.websiteAnalytics.snapshot, {
			days: 30,
		});
		expect(view.snapshot?.summary).toBeUndefined();
		expect(view.snapshot?.lastError?.kind).toBe("network");
	});

	it("clears the error on the next success", async () => {
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		provider.failure = { kind: "network" };
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		vi.advanceTimersByTime(61_000);
		provider.failure = undefined;
		await board.action(api.websiteAnalytics.refresh, { days: 30 });
		const view = await board.query(api.websiteAnalytics.snapshot, {
			days: 30,
		});
		expect(view.snapshot?.lastError).toBeUndefined();
	});

	it("reports not configured when no provider exists", async () => {
		setWebAnalyticsProviderForTests(undefined);
		vi.stubEnv("CLOUDFLARE_ANALYTICS_TOKEN", "");
		vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
		const backend = await seed();
		const board = backend.withIdentity(BOARD);
		expect(
			await board.query(api.websiteAnalytics.snapshot, { days: 30 })
		).toEqual({ days: 30, configured: false, snapshot: null });
		expect(
			await board.action(api.websiteAnalytics.refresh, { days: 30 })
		).toEqual({ kind: "notConfigured" });
		vi.unstubAllEnvs();
	});
});
