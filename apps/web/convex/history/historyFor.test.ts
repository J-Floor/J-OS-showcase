import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import type { Id } from "../_generated/dataModel";
import type { PerkRequestStatus } from "../lib/perks.ts";
import schema from "../schema.ts";

import { DOOR_ACTION_LIMIT } from "./doorLogSource.ts";
import { HISTORY_LIMIT, historyFor } from "./historyFor.ts";

const modules = import.meta.glob("../**/*.*s");

type Backend = TestConvex<typeof schema>;

async function seedPerson(
	backend: Backend,
	email: string,
	firstName: string
): Promise<Id<"people">> {
	return backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName,
			lastName: "Example",
			tier: "member",
			stage: "active",
			stageSince: 0,
		})
	);
}

async function seedPerk(backend: Backend): Promise<Id<"perks">> {
	return backend.run((context) =>
		context.db.insert("perks", {
			partner: "Example Cloud",
			title: "Cloud credits",
			terms: "Credits for the first year.",
			category: "cloud",
			createdAt: 0,
		})
	);
}

async function seedRequest(
	backend: Backend,
	ids: { personId: Id<"people">; perkId: Id<"perks"> },
	fields: { requestedAt: number; status: PerkRequestStatus; statusAt: number }
): Promise<Id<"perkRequests">> {
	return backend.run((context) =>
		context.db.insert("perkRequests", { ...ids, ...fields })
	);
}

async function seedPerkEvent(
	backend: Backend,
	row: {
		personId: Id<"people">;
		perkId: Id<"perks">;
		perkRequestId: Id<"perkRequests">;
		actorId: Id<"people">;
		event: PerkRequestStatus;
		at: number;
	}
): Promise<void> {
	const { perkId, ...rest } = row;
	await backend.run(async (context) => {
		await context.db.insert("personEvents", {
			...rest,
			kind: "perk",
			meta: { perkId },
		});
	});
}

/** Ada, the board's Bo, Cy (someone else), and one perk. */
async function setup() {
	const backend = convexTest(schema, modules);
	const adaId = await seedPerson(backend, "ada@example.com", "Ada");
	const boId = await seedPerson(backend, "bo@example.com", "Bo");
	const cyId = await seedPerson(backend, "cy@example.com", "Cy");
	const perkId = await seedPerk(backend);
	return { backend, adaId, boId, cyId, perkId };
}

describe("historyFor a person", () => {
	it("merges person events, door actions and perk events, newest first, with actor names", async () => {
		const { backend, adaId, boId, cyId, perkId } = await setup();
		const requestId = await seedRequest(
			backend,
			{ personId: adaId, perkId },
			{ requestedAt: 3000, status: "contacted", statusAt: 4000 }
		);
		await seedPerkEvent(backend, {
			personId: adaId,
			perkId,
			perkRequestId: requestId,
			actorId: adaId,
			event: "requested",
			at: 3000,
		});
		await seedPerkEvent(backend, {
			personId: adaId,
			perkId,
			perkRequestId: requestId,
			actorId: boId,
			event: "contacted",
			at: 4000,
		});
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: adaId,
				at: 1000,
				kind: "transition",
				event: "SUBMIT",
				to: "prospect.unverified",
			});
			// Someone else's event never shows in Ada's history.
			await context.db.insert("personEvents", {
				personId: cyId,
				at: 2500,
				kind: "transition",
				event: "SUBMIT",
			});
			await context.db.insert("doorLog", {
				at: 2000,
				operation: "unlock",
				trigger: "app",
				email: "ada@example.com",
				name: "Ada Example",
				personId: adaId,
				actorId: adaId,
				lockNames: ["Downstairs"],
				slot: "downstairs",
				outcome: "ok",
			});
			// A key grant is what the app did to Ada, not what she did.
			await context.db.insert("doorLog", {
				at: 2200,
				operation: "grant",
				trigger: "lifecycle",
				email: "ada@example.com",
				name: "Ada Example",
				personId: adaId,
				lockNames: ["Downstairs"],
				outcome: "ok",
			});
		});

		const entries = await backend.run((context) =>
			historyFor(context, { personId: adaId })
		);

		expect(entries.map((entry) => [entry.at, entry.kind])).toEqual([
			[4000, "perk"],
			[3000, "perk"],
			[2000, "door_action"],
			[1000, "transition"],
		]);
		expect(entries[0]).toMatchObject({
			kind: "perk",
			event: "contacted",
			perkRequestId: requestId,
			perkId,
			perkTitle: "Cloud credits",
			partner: "Example Cloud",
			actorId: boId,
			actorName: "Bo Example",
		});
		expect(entries[1]).toMatchObject({
			event: "requested",
			actorName: "Ada Example",
		});
		expect(entries[2]).toMatchObject({
			action: "unlock",
			slot: "downstairs",
			outcome: "ok",
			actorName: "Ada Example",
		});
		expect(entries[3].actorName).toBeUndefined();
	});

	it("caps the merged history at the newest HISTORY_LIMIT entries", async () => {
		const { backend, adaId } = await setup();
		const total = HISTORY_LIMIT + 5;
		await backend.run(async (context) => {
			for (let index = 0; index < total; index += 1)
				await context.db.insert("personEvents", {
					personId: adaId,
					// Inserted oldest last, so a read by creation order would
					// keep the wrong end.
					at: total - index,
					kind: "field_edit",
					field: "board.notes",
				});
		});

		const entries = await backend.run((context) =>
			historyFor(context, { personId: adaId })
		);

		expect(entries).toHaveLength(HISTORY_LIMIT);
		expect(entries[0].at).toBe(total);
		expect(entries.at(-1)?.at).toBe(total - HISTORY_LIMIT + 1);
	});
});

describe("historyFor budgets", () => {
	it("never lets newer door actions push the person's events out", async () => {
		const { backend, adaId } = await setup();
		await backend.run(async (context) => {
			for (let index = 0; index < HISTORY_LIMIT; index += 1)
				await context.db.insert("personEvents", {
					personId: adaId,
					at: index,
					kind: "field_edit",
					field: "board.notes",
				});
			for (let index = 0; index < DOOR_ACTION_LIMIT; index += 1)
				await context.db.insert("doorLog", {
					at: 10_000 + index,
					operation: "unlock",
					trigger: "app",
					email: "ada@example.com",
					name: "Ada Example",
					personId: adaId,
					actorId: adaId,
					lockNames: ["Downstairs"],
					slot: "downstairs",
					outcome: "ok",
				});
		});

		const entries = await backend.run((context) =>
			historyFor(context, { personId: adaId })
		);

		const kinds = entries.map((entry) => entry.kind);
		expect(kinds.filter((kind) => kind === "field_edit")).toHaveLength(
			HISTORY_LIMIT
		);
		expect(kinds.filter((kind) => kind === "door_action")).toHaveLength(
			DOOR_ACTION_LIMIT
		);
	});
});

describe("a malformed perk event", () => {
	it("shows unlinked instead of breaking the history", async () => {
		const { backend, adaId } = await setup();
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: adaId,
				at: 1000,
				kind: "perk",
				event: "requested",
			});
			await context.db.insert("personEvents", {
				personId: adaId,
				at: 2000,
				kind: "perk",
				event: "contacted",
				meta: "not an object",
			});
		});

		const entries = await backend.run((context) =>
			historyFor(context, { personId: adaId })
		);

		expect(
			entries.map((entry) =>
				entry.kind === "perk"
					? [entry.event, entry.perkId, entry.perkTitle]
					: entry.kind
			)
		).toEqual([
			["contacted", undefined, undefined],
			["requested", undefined, undefined],
		]);
	});
});

describe("historyFor one perk request", () => {
	it("returns only that request's events", async () => {
		const { backend, adaId, boId, perkId } = await setup();
		const requestId = await seedRequest(
			backend,
			{ personId: adaId, perkId },
			{ requestedAt: 1000, status: "granted", statusAt: 2000 }
		);
		const otherId = await seedRequest(
			backend,
			{ personId: adaId, perkId },
			{ requestedAt: 1500, status: "requested", statusAt: 1500 }
		);
		await seedPerkEvent(backend, {
			personId: adaId,
			perkId,
			perkRequestId: requestId,
			actorId: adaId,
			event: "requested",
			at: 1000,
		});
		await seedPerkEvent(backend, {
			personId: adaId,
			perkId,
			perkRequestId: requestId,
			actorId: boId,
			event: "granted",
			at: 2000,
		});
		await seedPerkEvent(backend, {
			personId: adaId,
			perkId,
			perkRequestId: otherId,
			actorId: adaId,
			event: "requested",
			at: 1500,
		});
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: adaId,
				at: 1200,
				kind: "transition",
				event: "SUBMIT",
			});
		});

		const entries = await backend.run((context) =>
			historyFor(context, { perkRequestId: requestId })
		);

		expect(
			entries.map((entry) => [entry.at, entry.kind, entry.actorName])
		).toEqual([
			[2000, "perk", "Bo Example"],
			[1000, "perk", "Ada Example"],
		]);
	});
});

describe("a perk request with no events", () => {
	it("contributes nothing: history is read from events alone", async () => {
		const { backend, adaId, boId, perkId } = await setup();
		const requestId = await backend.run((context) =>
			context.db.insert("perkRequests", {
				personId: adaId,
				perkId,
				requestedAt: 1000,
				status: "granted",
				statusAt: 2000,
				statusById: boId,
			})
		);

		for (const scope of [
			{ personId: adaId },
			{ perkRequestId: requestId },
		]) {
			const entries = await backend.run((context) =>
				historyFor(context, scope)
			);
			expect(entries).toEqual([]);
		}
	});
});
