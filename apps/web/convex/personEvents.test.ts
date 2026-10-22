import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("personEvents.listForPerson", () => {
	it("returns rows newest first with the actor's name resolved", async () => {
		const backend = convexTest(schema, modules);
		const boardId = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const id = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("personEvents", {
				personId,
				at: 1000,
				kind: "transition",
				event: "SUBMIT",
				to: "prospect.unverified",
			});
			await context.db.insert("personEvents", {
				personId,
				at: 2000,
				actorId: boardId,
				kind: "field_edit",
				field: "board.notes",
				before: "old",
				after: "new",
			});
			return personId;
		});
		// A second person with their own event, at a timestamp that would sort
		// between the two rows above if scoping were dropped — a bare
		// `.collect()` (no `by_person` filter) would pass the ordering
		// assertions below unchanged, but this row must never appear in Ada's
		// timeline: one board member's sheet showing another person's history
		// is the failure mode this query exists to prevent.
		await backend.run(async (context) => {
			const otherId = await context.db.insert("people", {
				email: "cy@example.com",
				firstName: "Cy",
				lastName: "Borg",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("personEvents", {
				personId: otherId,
				at: 1500,
				kind: "field_edit",
				field: "board.notes",
				before: "x",
				after: "y",
			});
		});

		const rows = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.personEvents.listForPerson, { personId: id });

		expect(rows.map((row) => row.at)).toEqual([2000, 1000]);
		expect(rows[0].actorName).toBe("Bo Ard");
		// A backfilled row has no actor and must render without inventing one.
		expect(rows[1].actorName).toBeUndefined();
		// Scoping: the other person's row never leaks into this timeline.
		expect(
			rows.some(
				(row) =>
					row.kind === "field_edit" &&
					row.field === "board.notes" &&
					row.after === "y"
			)
		).toBe(false);
	});

	it("merges the person's app door unlocks and locks in, but not key grants", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const id = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			const otherId = await context.db.insert("people", {
				email: "cy@example.com",
				firstName: "Cy",
				lastName: "Borg",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("personEvents", {
				personId,
				at: 1000,
				kind: "transition",
				event: "SUBMIT",
				to: "prospect.unverified",
			});
			const door = {
				trigger: "app" as const,
				email: "ada@example.com",
				name: "Ada Lovelace",
				personId,
				actorId: personId,
			};
			await context.db.insert("doorLog", {
				...door,
				at: 1500,
				operation: "unlock",
				slot: "downstairs",
				lockNames: ["J floor Downstairs"],
				outcome: "ok",
			});
			await context.db.insert("doorLog", {
				...door,
				at: 2500,
				operation: "lock",
				slot: "upstairs",
				lockNames: ["J floor Upstairs"],
				outcome: "failed",
				detail: "offline",
			});
			// A key grant is not something the person did at the door.
			await context.db.insert("doorLog", {
				...door,
				at: 3000,
				operation: "grant",
				trigger: "lifecycle",
				lockNames: ["J floor Upstairs"],
				outcome: "ok",
			});
			await context.db.insert("doorLog", {
				...door,
				at: 2000,
				personId: otherId,
				actorId: otherId,
				operation: "unlock",
				slot: "downstairs",
				lockNames: ["J floor Downstairs"],
				outcome: "ok",
			});
			return personId;
		});

		const rows = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.personEvents.listForPerson, { personId: id });

		expect(rows.map((row) => [row.at, row.kind])).toEqual([
			[2500, "door_action"],
			[1500, "door_action"],
			[1000, "transition"],
		]);
		expect(rows[0]).toMatchObject({
			action: "lock",
			slot: "upstairs",
			outcome: "failed",
			detail: "offline",
			actorName: "Ada Lovelace",
		});
		expect(rows[1]).toMatchObject({
			action: "unlock",
			slot: "downstairs",
			outcome: "ok",
		});
	});

	it("returns an empty list for a person with no events, rather than throwing", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) =>
			context.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		const rows = await backend
			.withIdentity({ email: "board@example.com" })
			.query(api.personEvents.listForPerson, { personId: id });

		expect(rows).toEqual([]);
	});

	it("is board-only — it records suspensions and internal reasons", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.query(api.personEvents.listForPerson, { personId: id })
		).rejects.toThrow(/Forbidden/);
	});
});
