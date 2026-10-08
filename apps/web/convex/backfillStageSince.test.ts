// @vitest-environment edge-runtime
import type { WithoutSystemFields } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.ts");

/** convex-test's `run` is untyped — it hands back `any` whatever the schema
 *  says — so the helpers below take the value as `unknown` and assert once, at
 *  the boundary, rather than letting `any` leak into every assertion.
 *
 *  No type argument: `convexTest<typeof schema>` looks like it would restore
 *  the typing, but `SchemaDefinition` does not satisfy the `GenericSchema`
 *  constraint (no index signature) and `tsc -b` rejects it. */
type Harness = ReturnType<typeof convexTest>;

/** The instant the cutover stamped on every row — the value being repaired. */
const STAMP = 1_785_680_094_061;
const DAY_MS = 86_400_000;

async function seed(
	t: Harness,
	// Typed, not `Record<string, unknown>`: spreading an index signature into
	// `insert` widens the whole document to `any`, and every read of it
	// downstream stops being checked.
	over: Partial<WithoutSystemFields<Doc<"people">>> = {}
): Promise<Id<"people">> {
	const id: unknown = await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "grace@example.com",
			firstName: "Grace",
			lastName: "Hopper",
			tier: "member",
			stage: "active",
			stageSince: STAMP,
			...over,
		})
	);
	return id as Id<"people">;
}

async function stageSince(t: Harness, id: Id<"people">): Promise<number> {
	const person = (await t.run(
		async (ctx): Promise<unknown> => ctx.db.get(id)
	)) as Doc<"people"> | null;
	if (person === null) throw new Error("person vanished");
	return person.stageSince;
}

describe("backfillStageSince", () => {
	it("uses the event that put them in the state they are in", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t);
		const entered = STAMP - 40 * DAY_MS;
		await t.run(async (ctx) => {
			await ctx.db.insert("personEvents", {
				personId: id,
				at: entered,
				kind: "transition",
				event: "SIGN_AGREEMENT",
				to: "member.active",
			});
			// A LATER entry that did not change their state — someone edited
			// a field. Taking the most recent event would date them from this
			// instead, which is why the entering event has to win outright
			// rather than merely tie.
			await ctx.db.insert("personEvents", {
				personId: id,
				at: STAMP - 3 * DAY_MS,
				kind: "field_edit",
				field: "phone",
			});
		});

		await t.mutation(internal.backfillStageSince.run, {});

		expect(await stageSince(t, id)).toBe(entered);
	});

	it("falls back to the latest event for a state entered without one", async () => {
		// `prospect.queued` is the case this exists for: you join the queue by
		// verifying your email, so no event names the queue as its target and
		// the verification is the moment they entered it.
		const t = convexTest(schema, modules);
		const id = await seed(t, { tier: "prospect", stage: "queued" });
		const verified = STAMP - 12 * DAY_MS;
		await t.run(async (ctx) => {
			await ctx.db.insert("personEvents", {
				personId: id,
				at: verified,
				kind: "transition",
				event: "VERIFY_EMAIL",
				to: "prospect.verified",
			});
		});

		await t.mutation(internal.backfillStageSince.run, {});

		expect(await stageSince(t, id)).toBe(verified);
	});

	it("falls back to the dates on the row when there is no history at all", async () => {
		const t = convexTest(schema, modules);
		const verifiedAt = STAMP - 5 * DAY_MS;
		const id = await seed(t, {
			verifiedAt,
			submittedAt: STAMP - 6 * DAY_MS,
		});

		await t.mutation(internal.backfillStageSince.run, {});

		expect(await stageSince(t, id)).toBe(verifiedAt);
	});

	it("leaves a row it knows nothing about, rather than restamping it", async () => {
		// Nothing to recover FROM. Writing the cutover instant back over itself
		// would claim a fact we do not have — and would leave the row matching
		// the batch filter forever.
		const t = convexTest(schema, modules);
		const id = await seed(t);

		const result = await t.mutation(internal.backfillStageSince.run, {});

		expect(result).toMatchObject({ written: 0, unknown: 1 });
		expect(await stageSince(t, id)).toBe(STAMP);
	});

	it("never dates someone later than the cutover that stamped them", async () => {
		// A future `stageSince` reads as a negative age, which `daysInStage`
		// floors to 0 — the very "Today" this migration exists to remove.
		const t = convexTest(schema, modules);
		const id = await seed(t);
		await t.run(async (ctx) => {
			await ctx.db.insert("personEvents", {
				personId: id,
				at: STAMP + 30 * DAY_MS,
				kind: "transition",
				event: "SIGN_AGREEMENT",
				to: "member.active",
			});
		});

		await t.mutation(internal.backfillStageSince.run, {});

		expect(await stageSince(t, id)).toBe(STAMP);
	});

	it("leaves a person whose stageSince is already real", async () => {
		const t = convexTest(schema, modules);
		const real = STAMP - 3 * DAY_MS;
		const id = await seed(t, { stageSince: real });
		await t.run(async (ctx) => {
			await ctx.db.insert("personEvents", {
				personId: id,
				at: STAMP - 99 * DAY_MS,
				kind: "transition",
				event: "SIGN_AGREEMENT",
				to: "member.active",
			});
		});

		await t.mutation(internal.backfillStageSince.run, {});

		expect(await stageSince(t, id)).toBe(real);
	});

	it("does nothing the second time", async () => {
		const t = convexTest(schema, modules);
		const id = await seed(t);
		await t.run(async (ctx) => {
			await ctx.db.insert("personEvents", {
				personId: id,
				at: STAMP - 7 * DAY_MS,
				kind: "transition",
				event: "SIGN_AGREEMENT",
				to: "member.active",
			});
		});

		await t.mutation(internal.backfillStageSince.run, {});
		const second = await t.mutation(internal.backfillStageSince.run, {});

		expect(second.written).toBe(0);
	});
});
