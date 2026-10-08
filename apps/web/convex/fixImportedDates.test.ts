// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.ts");

const BAD = Date.UTC(2025, 11, 31, 9, 30);
const SUBMITTED = Date.UTC(2026, 4, 12, 8, 0);
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

async function seed(
	t: ReturnType<typeof convexTest>,
	over: { submittedAt?: number } = {}
): Promise<Id<"people">> {
	return t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "grace@example.com",
			firstName: "Grace",
			lastName: "Hopper",
			tier: "member",
			stage: "active",
			stageSince: 0,
			submittedAt: "submittedAt" in over ? over.submittedAt : SUBMITTED,
		})
	);
}

async function addEvent(
	t: ReturnType<typeof convexTest>,
	personId: Id<"people">,
	event: string,
	at: number
): Promise<void> {
	await t.run(async (ctx) => {
		await ctx.db.insert("personEvents", {
			personId,
			at,
			kind: "transition",
			event,
			to: "member.active",
		});
	});
}

describe("fixImportedDates", () => {
	it("moves an approval to the day after they applied", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		await addEvent(t, personId, "APPROVE_MEMBER", BAD);

		await t.mutation(internal.fixImportedDates.run, {});

		const at = await t.run(async (ctx) => {
			const rows = await ctx.db.query("personEvents").collect();
			return rows[0].at;
		});
		expect(at).toBe(SUBMITTED + DAY_MS);
	});

	it("puts the signature after the approval, not alongside it", async () => {
		// Both timestamps are stand-ins. Identical ones would leave the drawer's
		// timeline free to print "Signed the agreement" above "Approved as a
		// member", which is a story that cannot have happened.
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		await addEvent(t, personId, "APPROVE_MEMBER", BAD);
		await addEvent(t, personId, "SIGN_AGREEMENT", BAD);

		await t.mutation(internal.fixImportedDates.run, {});

		const [approve, sign] = await t.run(async (ctx) => {
			const rows = await ctx.db.query("personEvents").collect();
			return [
				rows.find((r) => r.event === "APPROVE_MEMBER")!.at,
				rows.find((r) => r.event === "SIGN_AGREEMENT")!.at,
			];
		});
		expect(sign).toBeGreaterThan(approve);
		expect(sign).toBe(SUBMITTED + DAY_MS + MINUTE_MS);
	});

	it("moves the signature record with the event that describes it", async () => {
		// One act, two rows. Repairing the timeline and leaving the agreement
		// record behind would give one signature two different dates.
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		await addEvent(t, personId, "SIGN_AGREEMENT", BAD);
		await t.run(async (ctx) => {
			await ctx.db.insert("signatures", {
				personId,
				email: "grace@example.com",
				variant: "member",
				signedName: "Grace Hopper",
				agreementVersion: "notion-import",
				agreementHash: "",
				signedAt: BAD,
			});
		});

		await t.mutation(internal.fixImportedDates.run, {});

		const { eventAt, signedAt } = await t.run(async (ctx) => ({
			eventAt: (await ctx.db.query("personEvents").collect())[0].at,
			signedAt: (await ctx.db.query("signatures").collect())[0].signedAt,
		}));
		expect(signedAt).toBe(eventAt);
	});

	it("leaves a date it cannot anchor alone rather than inventing a second one", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t, { submittedAt: undefined });
		await addEvent(t, personId, "SIGN_AGREEMENT", BAD);

		const result = await t.mutation(internal.fixImportedDates.run, {});

		expect(result.skipped).toBe(1);
		const at = await t.run(
			async (ctx) => (await ctx.db.query("personEvents").collect())[0].at
		);
		expect(at).toBe(BAD);
	});

	it("does not touch events outside the bad day", async () => {
		// The window is one specific day the importer stamped. A real approval
		// that happens to be a `SIGN_AGREEMENT` must survive untouched.
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		const real = Date.UTC(2026, 5, 1, 10, 0);
		await addEvent(t, personId, "SIGN_AGREEMENT", real);

		await t.mutation(internal.fixImportedDates.run, {});

		const at = await t.run(
			async (ctx) => (await ctx.db.query("personEvents").collect())[0].at
		);
		expect(at).toBe(real);
	});

	it("does not touch an unrelated event that happens to fall on that day", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		await addEvent(t, personId, "VERIFY_EMAIL", BAD);

		await t.mutation(internal.fixImportedDates.run, {});

		const at = await t.run(
			async (ctx) => (await ctx.db.query("personEvents").collect())[0].at
		);
		expect(at).toBe(BAD);
	});

	it("does nothing the second time", async () => {
		const t = convexTest(schema, modules);
		const personId = await seed(t);
		await addEvent(t, personId, "APPROVE_MEMBER", BAD);

		await t.mutation(internal.fixImportedDates.run, {});
		const second = await t.mutation(internal.fixImportedDates.run, {});

		expect(second.events).toBe(0);
		expect(second.signatures).toBe(0);
	});
});
