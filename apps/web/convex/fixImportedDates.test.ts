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
	backend: ReturnType<typeof convexTest>,
	over: { submittedAt?: number } = {}
): Promise<Id<"people">> {
	return backend.run(async (context) =>
		context.db.insert("people", {
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
	backend: ReturnType<typeof convexTest>,
	personId: Id<"people">,
	event: string,
	at: number
): Promise<void> {
	await backend.run(async (context) => {
		await context.db.insert("personEvents", {
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
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		await addEvent(backend, personId, "APPROVE_MEMBER", BAD);

		await backend.mutation(internal.fixImportedDates.run, {});

		const at = await backend.run(async (context) => {
			const rows = await context.db.query("personEvents").collect();
			return rows[0].at;
		});
		expect(at).toBe(SUBMITTED + DAY_MS);
	});

	it("puts the signature after the approval, not alongside it", async () => {
		// Both timestamps are stand-ins. Identical ones would leave the sheet's
		// timeline free to print "Signed the agreement" above "Approved as a
		// member", which is a story that cannot have happened.
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		await addEvent(backend, personId, "APPROVE_MEMBER", BAD);
		await addEvent(backend, personId, "SIGN_AGREEMENT", BAD);

		await backend.mutation(internal.fixImportedDates.run, {});

		const [approve, sign] = await backend.run(async (context) => {
			const rows = await context.db.query("personEvents").collect();
			return [
				rows.find((row) => row.event === "APPROVE_MEMBER")!.at,
				rows.find((row) => row.event === "SIGN_AGREEMENT")!.at,
			];
		});
		expect(sign).toBeGreaterThan(approve);
		expect(sign).toBe(SUBMITTED + DAY_MS + MINUTE_MS);
	});

	it("moves the signature record with the event that describes it", async () => {
		// One act, two rows. Repairing the timeline and leaving the agreement
		// record behind would give one signature two different dates.
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		await addEvent(backend, personId, "SIGN_AGREEMENT", BAD);
		await backend.run(async (context) => {
			await context.db.insert("signatures", {
				personId,
				email: "grace@example.com",
				variant: "member",
				signedName: "Grace Hopper",
				agreementVersion: "notion-import",
				agreementHash: "",
				signedAt: BAD,
			});
		});

		await backend.mutation(internal.fixImportedDates.run, {});

		const { eventAt, signedAt } = await backend.run(async (context) => {
			const [event] = await context.db.query("personEvents").collect();
			const [signature] = await context.db.query("signatures").collect();
			return { eventAt: event.at, signedAt: signature.signedAt };
		});
		expect(signedAt).toBe(eventAt);
	});

	it("leaves a date it cannot anchor alone rather than inventing a second one", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend, { submittedAt: undefined });
		await addEvent(backend, personId, "SIGN_AGREEMENT", BAD);

		const result = await backend.mutation(
			internal.fixImportedDates.run,
			{}
		);

		expect(result.skipped).toBe(1);
		const at = await backend.run(async (context) => {
			const [event] = await context.db.query("personEvents").collect();
			return event.at;
		});
		expect(at).toBe(BAD);
	});

	it("does not touch events outside the bad day", async () => {
		// The window is one specific day the importer stamped. A real approval
		// that happens to be a `SIGN_AGREEMENT` must survive untouched.
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		const real = Date.UTC(2026, 5, 1, 10, 0);
		await addEvent(backend, personId, "SIGN_AGREEMENT", real);

		await backend.mutation(internal.fixImportedDates.run, {});

		const at = await backend.run(async (context) => {
			const [event] = await context.db.query("personEvents").collect();
			return event.at;
		});
		expect(at).toBe(real);
	});

	it("does not touch an unrelated event that happens to fall on that day", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		await addEvent(backend, personId, "VERIFY_EMAIL", BAD);

		await backend.mutation(internal.fixImportedDates.run, {});

		const at = await backend.run(async (context) => {
			const [event] = await context.db.query("personEvents").collect();
			return event.at;
		});
		expect(at).toBe(BAD);
	});

	it("does nothing the second time", async () => {
		const backend = convexTest(schema, modules);
		const personId = await seed(backend);
		await addEvent(backend, personId, "APPROVE_MEMBER", BAD);

		await backend.mutation(internal.fixImportedDates.run, {});
		const second = await backend.mutation(
			internal.fixImportedDates.run,
			{}
		);

		expect(second.events).toBe(0);
		expect(second.signatures).toBe(0);
	});
});
