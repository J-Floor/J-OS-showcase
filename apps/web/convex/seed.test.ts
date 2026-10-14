// apps/web/convex/seed.test.ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import { reapplyDecision } from "./lib/reapply.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("seed.run", () => {
	it("gives every seeded board person a tier/stage", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		const board = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_tier_and_formerOf", (range) =>
					range.eq("tier", "board")
				)
				.collect()
		);
		// 4 fixed board fixtures; no `boardEmail` arg here.
		expect(board).toHaveLength(4);
		for (const member of board) {
			expect(member.stage).toBe("active");
			expect(member.stageSince).toBeTypeOf("number");
		}
	});

	it("lands a `person`-less entry (e.g. a denied application) as a prospect, not a typeless row", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		const dennis = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "dennis@jfloor.test")
				)
				.unique()
		);
		expect(dennis).toMatchObject({ tier: "prospect", stage: "denied" });
	});

	it("demotes the kicked-out fixture to `former`, keeping who they were and why", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		const seymour = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "seymour@jfloor.test")
				)
				.unique()
		);
		expect(seymour).toMatchObject({
			tier: "former",
			stage: "active",
			formerOf: "member",
			formerReason: "kicked",
		});
	});

	it("gives every denied prospect a `deniedAt`, so the six-month reapply debounce actually engages", async () => {
		// `reapplyDecision` only applies `REAPPLY_DEBOUNCE_MS` when
		// `deniedAt != null`, and `prospect.denied` has a legal `REAPPLY` edge —
		// so a denied seeded row with no `deniedAt` would let a fresh sign-up
		// reusing that email skip the debounce entirely and reuse the row as
		// though never denied. This predates the tier/stage rewrite (the old
		// `applications` insert never set `deniedAt` either); fixed here because
		// moving these rows onto `people` is the natural point to close it.
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		for (const email of [
			"dennis@jfloor.test",
			"charles@jfloor.test",
			"joan@jfloor.test",
		]) {
			const person = await backend.run((context) =>
				context.db
					.query("people")
					.withIndex("by_email", (range) => range.eq("email", email))
					.unique()
			);
			expect(person?.stage).toBe("denied");
			expect(person?.deniedAt).toBeTypeOf("number");
		}

		const dennis = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "dennis@jfloor.test")
				)
				.unique()
		);
		expect(reapplyDecision(dennis, Date.now())).toMatchObject({
			kind: "blocked",
			reason: "debounce",
		});
	});

	it("returns a `people` total with no duplicate/second key and no `applications` count", async () => {
		const backend = convexTest(schema, modules);
		const result = await backend.mutation(internal.seed.run, {});

		expect(result).not.toHaveProperty("applications");
		const allPeople = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(result.people).toBe(allPeople.length);
	});

	it("seeds the wifiConfig singleton with the dev placeholder, idempotently", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		const rowsAfterFirst = await backend.run((context) =>
			context.db.query("wifiConfig").collect()
		);
		expect(rowsAfterFirst).toHaveLength(1);
		expect(rowsAfterFirst[0]).toMatchObject({ ssid: "J floor (dev)" });

		// Re-running (a reseed) must not insert a second row.
		await backend.mutation(internal.seed.run, {});
		const rowsAfterSecond = await backend.run((context) =>
			context.db.query("wifiConfig").collect()
		);
		expect(rowsAfterSecond).toHaveLength(1);
		expect(rowsAfterSecond[0]._id).toBe(rowsAfterFirst[0]._id);
	});

	it("seeds a small inventory so the board page is not empty", async () => {
		const backend = convexTest(schema, modules);
		await backend.mutation(internal.seed.run, {});

		const [categories, types, items] = await Promise.all([
			backend.run((context) =>
				context.db.query("itemCategories").collect()
			),
			backend.run((context) => context.db.query("itemTypes").collect()),
			backend.run((context) => context.db.query("items").collect()),
		]);
		expect(
			categories
				.map((category) => category.name)
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				.sort((a, b) => a.localeCompare(b))
		).toEqual(["AV", "Furniture", "Kitchen"]);
		expect(types.length).toBeGreaterThanOrEqual(4);
		expect(items.length).toBeGreaterThanOrEqual(4);
		expect(items.every((item) => /^[A-Z]\d{5}$/.test(item.assetTag))).toBe(
			true
		);
	});
});

describe("seed.clearAll", () => {
	it("wipes people, signatures, personEvents and purgeLog, not just people/applications", async () => {
		const backend = convexTest(schema, modules);
		const personId = await backend.run((context) =>
			context.db.insert("people", {
				email: "leftover@example.com",
				firstName: "Left",
				lastName: "Over",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId,
				at: Date.now(),
				kind: "transition",
				event: "IMPORT",
			});
			await context.db.insert("purgeLog", { at: Date.now(), count: 1 });
			await context.db.insert("signatures", {
				personId,
				email: "leftover@example.com",
				variant: "member",
				signedName: "Left Over",
				agreementVersion: "v1",
				agreementHash: "hash",
				signedAt: Date.now(),
				sourceUrl: "https://example.com/a.pdf",
			});
		});

		await backend.mutation(internal.seed.clearAll, {});

		const [people, events, logs, sigs] = await Promise.all([
			backend.run((context) => context.db.query("people").collect()),
			backend.run((context) =>
				context.db.query("personEvents").collect()
			),
			backend.run((context) => context.db.query("purgeLog").collect()),
			backend.run((context) => context.db.query("signatures").collect()),
		]);
		expect(people).toHaveLength(0);
		expect(events).toHaveLength(0);
		expect(logs).toHaveLength(0);
		expect(sigs).toHaveLength(0);
	});

	it("wipes inventory categories, types, and items", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			const categoryId = await context.db.insert("itemCategories", {
				name: "Leftover",
			});
			const typeId = await context.db.insert("itemTypes", {
				name: "Thing",
				categoryId,
			});
			await context.db.insert("items", {
				typeId,
				assetTag: "Z00001",
			});
		});

		await backend.mutation(internal.seed.clearAll, {});

		const [categories, types, items] = await Promise.all([
			backend.run((context) =>
				context.db.query("itemCategories").collect()
			),
			backend.run((context) => context.db.query("itemTypes").collect()),
			backend.run((context) => context.db.query("items").collect()),
		]);
		expect(categories).toHaveLength(0);
		expect(types).toHaveLength(0);
		expect(items).toHaveLength(0);
	});
});
