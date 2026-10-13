import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { runAndCollectLogs } from "../test-stubs/runAndCollectLogs.ts";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizeEmail } from "./lib/emailAddress.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

function createTester() {
	return convexTest(schema, modules);
}
type Tester = ReturnType<typeof createTester>;

// Raw inserts on purpose: they bypass every writer's normalization, which is
// exactly how the rows this migration exists for were written.
async function seedPerson(t: Tester, email: string) {
	return t.run((ctx) =>
		ctx.db.insert("people", {
			email,
			firstName: "Case",
			lastName: "Person",
			tier: "member",
			stage: "active",
			stageSince: 1,
		})
	);
}

describe("migrateEmailCase", () => {
	it("lowercases non-canonical emails, leaves canonical rows alone, and is a no-op on re-run", async () => {
		const t = createTester();
		const mixed = await seedPerson(t, "Ada@Example.COM");
		const padded = await seedPerson(t, "  grace@example.com ");
		const canonical = await seedPerson(t, "alan@example.com");
		const before = await t.run((ctx) => ctx.db.get(canonical));

		expect(
			await t.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({
			nonCanonical: [
				{ _id: mixed, email: "Ada@Example.COM" },
				{ _id: padded, email: "  grace@example.com " },
			],
			isDone: true,
		});
		expect(
			await t.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 2, collisions: 0, isDone: true });

		expect((await t.run((ctx) => ctx.db.get(mixed)))?.email).toBe(
			"ada@example.com"
		);
		expect((await t.run((ctx) => ctx.db.get(padded)))?.email).toBe(
			"grace@example.com"
		);
		expect(await t.run((ctx) => ctx.db.get(canonical))).toEqual(before);

		expect(
			await t.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 0, collisions: 0, isDone: true });
		expect(
			await t.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({ nonCanonical: [], isDone: true });
	});

	it("skips and counts a row whose canonical email another person holds", async () => {
		const t = createTester();
		const holder = await seedPerson(t, "ada@example.com");
		const clash = await seedPerson(t, "Ada@example.com");
		const loner = await seedPerson(t, "Grace@example.com");
		const clashBefore = await t.run((ctx) => ctx.db.get(clash));

		expect(
			await t.query(internal.migrations.findEmailCollisions, {})
		).toEqual([
			{
				email: "ada@example.com",
				people: [
					{ _id: holder, email: "ada@example.com" },
					{ _id: clash, email: "Ada@example.com" },
				],
			},
		]);
		expect(
			await t.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 1, collisions: 1, isDone: true });

		expect(await t.run((ctx) => ctx.db.get(clash))).toEqual(clashBefore);
		expect((await t.run((ctx) => ctx.db.get(loner)))?.email).toBe(
			"grace@example.com"
		);
		const ada = await t.run((ctx) =>
			ctx.db
				.query("people")
				.withIndex("by_email", (q) => q.eq("email", "ada@example.com"))
				.collect()
		);
		expect(ada.map((p) => p._id)).toEqual([holder]);
		expect(
			await t.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({ nonCanonical: [{ _id: clash }] });
	});

	it("counts the second of two variants that only collide with each other", async () => {
		const t = createTester();
		const first = await seedPerson(t, "Ada@example.com");
		const second = await seedPerson(t, "ADA@example.com");

		expect(
			await t.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 1, collisions: 1, isDone: true });
		expect((await t.run((ctx) => ctx.db.get(first)))?.email).toBe(
			"ada@example.com"
		);
		expect((await t.run((ctx) => ctx.db.get(second)))?.email).toBe(
			"ADA@example.com"
		);
	});

	it("walks every page by scheduling itself", async () => {
		const t = createTester();
		const total = 250;
		await t.run(async (ctx) => {
			for (let i = 0; i < total; i++) {
				await ctx.db.insert("people", {
					email: `Paged${String(i)}@Example.com`,
					firstName: "Paged",
					lastName: "Person",
					tier: "visitor",
					stage: "verified",
					stageSince: 1,
				});
			}
		});

		let first: unknown;
		await runAndCollectLogs(t, async () => {
			first = await t.mutation(internal.migrations.migrateEmailCase, {});
		});
		expect(first).toEqual({
			peoplePatched: 100,
			collisions: 0,
			isDone: false,
		});

		const people = await t.run((ctx) => ctx.db.query("people").collect());
		expect(people).toHaveLength(total);
		expect(
			people.filter((p) => p.email !== normalizeEmail(p.email))
		).toEqual([]);
	});
});

describe("backfillActivatedAt", () => {
	it("stamps active rows from stageSince and others from their history", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const base = {
				firstName: "X",
				lastName: "Y",
				stageSince: 100,
			} as const;
			const active = await ctx.db.insert("people", {
				...base,
				email: "a@example.com",
				tier: "member",
				stage: "active",
			});
			const expired = await ctx.db.insert("people", {
				...base,
				email: "e@example.com",
				tier: "guest",
				stage: "expired",
			});
			await ctx.db.insert("personEvents", {
				personId: expired,
				at: 50,
				kind: "transition",
				event: "ONBOARDING_PROGRESSED",
				from: "guest.onboarding",
				to: "guest.active",
			});
			const neverActive = await ctx.db.insert("people", {
				...base,
				email: "n@example.com",
				tier: "guest",
				stage: "expired",
			});
			const former = await ctx.db.insert("people", {
				...base,
				email: "f@example.com",
				tier: "former",
				stage: "active",
				formerOf: "member",
				formerReason: "left",
			});
			await ctx.db.insert("personEvents", {
				personId: former,
				at: 70,
				kind: "transition",
				event: "ONBOARDING_PROGRESSED",
				from: "member.onboarding",
				to: "member.active",
			});
			const leftEarly = await ctx.db.insert("people", {
				...base,
				email: "l@example.com",
				tier: "former",
				stage: "active",
				formerOf: "member",
				formerReason: "left",
			});
			await ctx.db.insert("personEvents", {
				personId: leftEarly,
				at: 60,
				kind: "transition",
				event: "KICK_OUT",
				from: "member.onboarding",
				to: "former.active",
			});
			const prospect = await ctx.db.insert("people", {
				...base,
				email: "p@example.com",
				tier: "prospect",
				stage: "queued",
			});
			return {
				active,
				expired,
				neverActive,
				former,
				leftEarly,
				prospect,
			};
		});
		await t.mutation(internal.migrations.backfillActivatedAt, {});
		function get(id: Id<"people">) {
			return t.run(
				async (ctx) => (await ctx.db.get(id))?.activatedAt ?? null
			);
		}
		expect(await get(ids.active)).toBe(100);
		expect(await get(ids.expired)).toBe(50);
		expect(await get(ids.neverActive)).toBeNull();
		expect(await get(ids.former)).toBe(70);
		expect(await get(ids.leftEarly)).toBeNull();
		expect(await get(ids.prospect)).toBeNull();
	});
});

describe("repairGuestWithoutAgreement", () => {
	it("moves an active guest with no guest agreement to onboarding with the document step re-opened, audited", async () => {
		const t = createTester();
		const id = await t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "A",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
				// Every step ticked, the document one under the member agreement.
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
					boardSteps: { whatsapp: { completedAt: 1 } },
				},
			});
			await ctx.db.insert("signatures", {
				personId: pid,
				email: "m@example.com",
				variant: "member",
				signedName: "M A",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
			});
			return pid;
		});
		await t.mutation(internal.migrations.repairGuestWithoutAgreement, {
			personId: id,
		});
		await t.run(async (ctx) => {
			const row = await ctx.db.get(id);
			expect(row?.stage).toBe("onboarding");
			// The wizard must have the agreement left to ask for.
			expect(Object.keys(row?.onboarding?.steps ?? {}).sort()).toEqual([
				"rules",
				"visit",
				"welcome",
			]);
			expect(row?.onboarding?.boardSteps).toEqual({
				whatsapp: { completedAt: 1 },
			});
			const ev = (await ctx.db.query("personEvents").collect()).find(
				(e) => e.event === "REPAIR"
			);
			expect(ev).toMatchObject({
				kind: "transition",
				from: "guest.active",
				to: "guest.onboarding",
			});
		});
	});

	it("refuses a guest who has the guest agreement", async () => {
		const t = createTester();
		const id = await t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "ok@example.com",
				firstName: "O",
				lastName: "K",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
			});
			await ctx.db.insert("signatures", {
				personId: pid,
				email: "ok@example.com",
				variant: "guest",
				signedName: "O K",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
			});
			return pid;
		});
		await expect(
			t.mutation(internal.migrations.repairGuestWithoutAgreement, {
				personId: id,
			})
		).rejects.toThrow();
	});
});
