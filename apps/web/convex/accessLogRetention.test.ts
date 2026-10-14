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
		const backend = convexTest(schema, modules);
		const now = Date.now();
		await backend.run(async (context) => {
			for (let index = 0; index < RETENTION_BATCH + 1; index++)
				await context.db.insert("doorLog", {
					at: now - TWELVE_MONTHS - DAY,
					operation: "unlock",
					trigger: "app",
					email: "ada@jfloor.test",
					name: "Ada",
					lockNames: [],
					outcome: "ok",
				});
			await context.db.insert("doorLog", {
				at: now - TWELVE_MONTHS + DAY,
				operation: "unlock",
				trigger: "app",
				email: "kept@jfloor.test",
				name: "Kept",
				lockNames: [],
				outcome: "ok",
			});
		});

		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.accessLogRetention.purgeDoorLog, {})
		);

		const left = await backend.run((context) =>
			context.db.query("doorLog").collect()
		);
		expect(left.map((row) => row.email)).toEqual(["kept@jfloor.test"]);
	});
});

describe("purgeWifiEvents", () => {
	it("deletes only old wifi events, across batches", async () => {
		const backend = convexTest(schema, modules);
		const now = Date.now();
		await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "ada@jfloor.test",
				firstName: "Ada",
				lastName: "L",
				tier: "member",
				stage: "active",
				stageSince: now,
			});
			for (let index = 0; index < RETENTION_BATCH + 1; index++)
				await context.db.insert("personEvents", {
					personId,
					at: now - TWELVE_MONTHS - DAY,
					kind: "wifi",
				});
			await context.db.insert("personEvents", {
				personId,
				at: now - TWELVE_MONTHS + DAY,
				kind: "wifi",
			});
			await context.db.insert("personEvents", {
				personId,
				at: now - TWELVE_MONTHS - DAY,
				kind: "door",
			});
		});

		await runAndCollectLogs(backend, () =>
			backend.mutation(internal.accessLogRetention.purgeWifiEvents, {})
		);

		const left = await backend.run((context) =>
			context.db.query("personEvents").collect()
		);
		expect(
			left
				.map((row) => row.kind)
				.sort((first, second) => first.localeCompare(second))
		).toEqual(["door", "wifi"]);
		expect(left.find((row) => row.kind === "wifi")!.at).toBeGreaterThan(
			now - TWELVE_MONTHS
		);
	});
});
