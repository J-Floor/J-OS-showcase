import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { DAY_MS } from "./lib/constants.ts";
import type { EmailPriority } from "./lib/emailProvider.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const LIMITS = { daily: 10, monthly: 1000 };

async function reserveMany(
	backend: ReturnType<typeof convexTest>,
	priority: EmailPriority,
	times: number
): Promise<boolean[]> {
	const out: boolean[] = [];
	for (let index = 0; index < times; index++) {
		out.push(
			await backend.mutation(internal.emailQuota.reserve, {
				priority,
				cost: 1,
				limits: LIMITS,
			})
		);
	}
	return out;
}

describe("emailQuota.reserve", () => {
	it.each([
		["digest", 5],
		["notification", 6],
		["anonymous", 8],
		["critical", 10],
	] as const)("lets %s use %i of 10", async (priority, allowed) => {
		const backend = convexTest(schema, modules);
		const results = await reserveMany(backend, priority, 12);
		expect(results.filter(Boolean)).toHaveLength(allowed);
		expect(results.slice(allowed).every((ok) => !ok)).toBe(true);
	});

	it("keeps headroom for critical after notifications stop", async () => {
		const backend = convexTest(schema, modules);
		await reserveMany(backend, "notification", 10);
		expect(await reserveMany(backend, "anonymous", 3)).toEqual([
			true,
			true,
			false,
		]);
		expect(await reserveMany(backend, "critical", 3)).toEqual([
			true,
			true,
			false,
		]);
	});

	it("enforces the monthly window too", async () => {
		const backend = convexTest(schema, modules);
		const limits = { daily: null, monthly: 2 };
		const ok = [];
		for (let index = 0; index < 3; index++) {
			ok.push(
				await backend.mutation(internal.emailQuota.reserve, {
					priority: "critical",
					cost: 1,
					limits,
				})
			);
		}
		expect(ok).toEqual([true, true, false]);
	});

	it("is a no-op for a provider with no limits", async () => {
		const backend = convexTest(schema, modules);
		const limits = { daily: null, monthly: null };
		const isOk = await backend.mutation(internal.emailQuota.reserve, {
			priority: "notification",
			cost: 1,
			limits,
		});
		expect(isOk).toBe(true);
		const rows = await backend.run((context) =>
			context.db.query("emailQuota").take(10)
		);
		expect(rows).toHaveLength(0);
	});
});

describe("emailQuota.sync", () => {
	it("raises used to the provider's count and never lowers it", async () => {
		const backend = convexTest(schema, modules);
		await reserveMany(backend, "critical", 3);
		await backend.mutation(internal.emailQuota.sync, {
			limits: LIMITS,
			dailyUsed: 5,
		});
		await backend.mutation(internal.emailQuota.sync, {
			limits: LIMITS,
			dailyUsed: 1,
		});
		expect(await reserveMany(backend, "notification", 2)).toEqual([
			true,
			false,
		]);
	});

	it("fills a window the provider reports exhausted", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.emailQuota.sync, {
			limits: LIMITS,
			exhausted: "daily",
		});
		expect(await reserveMany(backend, "critical", 1)).toEqual([false]);
	});
});

describe("emailQuota.purgeOld", () => {
	it("deletes rows past retention and keeps current ones", async () => {
		const backend = convexTest(schema, modules);
		const now = Date.now();
		await backend.run(async (context) => {
			await context.db.insert("emailQuota", {
				window: "day:old",
				startsAt: now - 70 * DAY_MS,
				used: 3,
			});
			await context.db.insert("emailQuota", {
				window: "day:today",
				startsAt: now,
				used: 1,
			});
		});
		await backend.mutation(internal.emailQuota.purgeOld, {});
		const rows = await backend.run((context) =>
			context.db.query("emailQuota").take(10)
		);
		expect(rows.map((row) => row.window)).toEqual(["day:today"]);
	});
});

describe("windowKeys", () => {
	it("uses the UTC day and month", async () => {
		const { windowKeys } = await import("./emailQuota.ts");
		expect(windowKeys(Date.UTC(2026, 10, 9, 23, 59))).toEqual({
			daily: "day:2026-11-09",
			monthly: "month:2026-11",
		});
	});
});
