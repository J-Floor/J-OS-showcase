import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema.ts";

const modules = import.meta.glob("/convex/**/*.*s");

type Backend = ReturnType<typeof convexTest>;

// 00:30 in Zurich on 2026-11-02 (23:30 UTC the day before), so "today" there
// is 2026-11-02 while UTC still says 2026-11-01.
const NOW = Date.UTC(2026, 10, 1, 23, 30);

async function seedPerk(
	backend: Backend,
	title: string,
	validUntil?: string
): Promise<Id<"perks">> {
	return backend.run((context) =>
		context.db.insert("perks", {
			partner: "Example Cloud",
			title,
			terms: "Terms apply.",
			category: "cloud",
			createdAt: NOW,
			validUntil,
		})
	);
}

async function dispatches(backend: Backend) {
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	return jobs.filter((job) => job.name === "notify/dispatch:run");
}

beforeEach(() => {
	// setTimeout keeps the queued dispatch from running; Date pins "today".
	vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

describe("perk expiring-soon reminders", () => {
	it("tells the community about a perk whose last day is seven site days away", async () => {
		const backend = convexTest(schema, modules);
		const perkId = await seedPerk(backend, "Week left", "2026-11-09");

		await backend.mutation(internal.notify.perkReminders.expiringSoon, {});

		expect(await dispatches(backend)).toEqual([
			expect.objectContaining({
				args: [
					{
						kind: "perkExpiringSoon",
						payload: {
							perkId,
							partner: "Example Cloud",
							perkTitle: "Week left",
							validUntil: "2026-11-09",
						},
					},
				],
			}),
		]);
	});

	it("skips perks ending six or eight days away, and perks with no end", async () => {
		const backend = convexTest(schema, modules);
		await seedPerk(backend, "Six days", "2026-11-08");
		await seedPerk(backend, "Eight days", "2026-11-10");
		await seedPerk(backend, "No end");

		await backend.mutation(internal.notify.perkReminders.expiringSoon, {});

		expect(await dispatches(backend)).toEqual([]);
	});

	it("ignores expired and far-off perks while telling the one that matches", async () => {
		const backend = convexTest(schema, modules);
		await seedPerk(backend, "Expired", "2026-10-01");
		await seedPerk(backend, "Far off", "2027-06-30");
		const perkId = await seedPerk(backend, "Week left", "2026-11-09");

		await backend.mutation(internal.notify.perkReminders.expiringSoon, {});

		const jobs = await dispatches(backend);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.args).toEqual([
			{
				kind: "perkExpiringSoon",
				payload: {
					perkId,
					partner: "Example Cloud",
					perkTitle: "Week left",
					validUntil: "2026-11-09",
				},
			},
		]);
	});
});
