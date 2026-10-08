import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { internal } from "./_generated/api";
import { RETENTION_BATCH, TWELVE_MONTHS } from "./accessLogRetention.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");
const DAY = 86_400_000;

describe("purgeDoorLog", () => {
	it("deletes rows older than 12 months across several batches and keeps newer ones", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		await t.run(async (ctx) => {
			for (let i = 0; i < RETENTION_BATCH + 1; i++)
				await ctx.db.insert("doorLog", {
					at: now - TWELVE_MONTHS - DAY,
					operation: "unlock",
					trigger: "app",
					email: "ada@jfloor.test",
					name: "Ada",
					lockNames: [],
					outcome: "ok",
				});
			await ctx.db.insert("doorLog", {
				at: now - TWELVE_MONTHS + DAY,
				operation: "unlock",
				trigger: "app",
				email: "kept@jfloor.test",
				name: "Kept",
				lockNames: [],
				outcome: "ok",
			});
		});

		await runAndCollectLogs(t, () =>
			t.mutation(internal.accessLogRetention.purgeDoorLog, {})
		);

		const left = await t.run((ctx) => ctx.db.query("doorLog").collect());
		expect(left.map((r) => r.email)).toEqual(["kept@jfloor.test"]);
	});
});

describe("purgeWifiEvents", () => {
	it("deletes only old wifi events, across batches", async () => {
		const t = convexTest(schema, modules);
		const now = Date.now();
		await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "ada@jfloor.test",
				firstName: "Ada",
				lastName: "L",
				tier: "member",
				stage: "active",
				stageSince: now,
			});
			for (let i = 0; i < RETENTION_BATCH + 1; i++)
				await ctx.db.insert("personEvents", {
					personId,
					at: now - TWELVE_MONTHS - DAY,
					kind: "wifi",
				});
			await ctx.db.insert("personEvents", {
				personId,
				at: now - TWELVE_MONTHS + DAY,
				kind: "wifi",
			});
			await ctx.db.insert("personEvents", {
				personId,
				at: now - TWELVE_MONTHS - DAY,
				kind: "door",
			});
		});

		await runAndCollectLogs(t, () =>
			t.mutation(internal.accessLogRetention.purgeWifiEvents, {})
		);

		const left = await t.run((ctx) =>
			ctx.db.query("personEvents").collect()
		);
		expect(left.map((r) => r.kind).sort()).toEqual(["door", "wifi"]);
		expect(left.find((r) => r.kind === "wifi")!.at).toBeGreaterThan(
			now - TWELVE_MONTHS
		);
	});
});
