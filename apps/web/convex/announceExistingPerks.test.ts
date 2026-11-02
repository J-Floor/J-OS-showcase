import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { KINDS } from "./notify/registry.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type Backend = ReturnType<typeof convexTest>;

const LONG_AGO = "2000-01-01";

function sorted(ids: string[]): string[] {
	// eslint-disable-next-line id-length -- conventional comparator parameter names
	return [...ids].sort((a, b) => a.localeCompare(b));
}

async function seedPerk(
	backend: Backend,
	partner: string,
	validUntil?: string
): Promise<Id<"perks">> {
	return backend.run(async (context) => {
		const contactId = await context.db.insert("people", {
			email: `${partner}@example.com`,
			firstName: "Anna",
			lastName: "Berg",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		});
		return context.db.insert("perks", {
			partner,
			title: `${partner} deal`,
			terms: "Terms",
			category: "cloud",
			contactId,
			createdBy: contactId,
			createdAt: Date.now(),
			validUntil,
		});
	});
}

async function dispatches(backend: Backend) {
	const jobs = await backend.run((context) =>
		context.db.system.query("_scheduled_functions").collect()
	);
	return jobs.filter((job) => job.name === "notify/dispatch:run");
}

describe("announceExistingPerks:run", () => {
	it("lists the active perks on a dry run and sends nothing", async () => {
		const backend = convexTest(schema, modules);
		const open = await seedPerk(backend, "Open");
		await seedPerk(backend, "Ended", LONG_AGO);

		const listed = await backend.mutation(
			internal.announceExistingPerks.run,
			{
				dryRun: true,
			}
		);

		expect(listed).toEqual([
			{ perkId: open, partner: "Open", title: "Open deal" },
		]);
		expect(await dispatches(backend)).toEqual([]);
	});

	it("sends one perkAdded per active perk and none for an expired one", async () => {
		const backend = convexTest(schema, modules);
		const open = await seedPerk(backend, "Open");
		const dated = await seedPerk(backend, "Dated", "2999-12-31");
		await seedPerk(backend, "Ended", LONG_AGO);

		const listed = await backend.mutation(
			internal.announceExistingPerks.run,
			{
				dryRun: false,
			}
		);

		expect(sorted(listed.map((row) => row.perkId))).toEqual(
			sorted([open, dated])
		);
		const jobs = await dispatches(backend);
		expect(jobs).toHaveLength(2);
		const payloads: unknown[] = jobs.map((job) => job.args[0] as unknown);
		expect(payloads).toEqual(
			expect.arrayContaining([
				{
					kind: "perkAdded",
					payload: {
						perkId: open,
						partner: "Open",
						perkTitle: "Open deal",
					},
				},
				{
					kind: "perkAdded",
					payload: {
						perkId: dated,
						partner: "Dated",
						perkTitle: "Dated deal",
					},
				},
			])
		);
	});

	it("reaches every community member, with nobody left out", async () => {
		const backend = convexTest(schema, modules);
		const perkId = await seedPerk(backend, "Open");
		const ids = await backend.run((context) =>
			KINDS.perkAdded.audience(context, {
				perkId,
				partner: "Open",
				perkTitle: "Open deal",
			})
		);
		const board = await backend.run((context) =>
			context.db
				.query("people")
				.collect()
				.then((people) => people.map((person) => person._id))
		);
		expect(sorted(ids)).toEqual(sorted(board));
	});
});
