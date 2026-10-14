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
async function seedPerson(backend: Tester, email: string) {
	return backend.run((context) =>
		context.db.insert("people", {
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
		const backend = createTester();
		const mixed = await seedPerson(backend, "Ada@Example.COM");
		const padded = await seedPerson(backend, "  grace@example.com ");
		const canonical = await seedPerson(backend, "alan@example.com");
		const before = await backend.run((context) =>
			context.db.get(canonical)
		);

		expect(
			await backend.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({
			nonCanonical: [
				{ _id: mixed, email: "Ada@Example.COM" },
				{ _id: padded, email: "  grace@example.com " },
			],
			isDone: true,
		});
		expect(
			await backend.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 2, collisions: 0, isDone: true });

		const mixedRow = await backend.run((context) => context.db.get(mixed));
		expect(mixedRow?.email).toBe("ada@example.com");
		const paddedRow = await backend.run((context) =>
			context.db.get(padded)
		);
		expect(paddedRow?.email).toBe("grace@example.com");
		expect(
			await backend.run((context) => context.db.get(canonical))
		).toEqual(before);

		expect(
			await backend.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 0, collisions: 0, isDone: true });
		expect(
			await backend.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({ nonCanonical: [], isDone: true });
	});

	it("skips and counts a row whose canonical email another person holds", async () => {
		const backend = createTester();
		const holder = await seedPerson(backend, "ada@example.com");
		const clash = await seedPerson(backend, "Ada@example.com");
		const loner = await seedPerson(backend, "Grace@example.com");
		const clashBefore = await backend.run((context) =>
			context.db.get(clash)
		);

		expect(
			await backend.query(internal.migrations.findEmailCollisions, {})
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
			await backend.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 1, collisions: 1, isDone: true });

		expect(await backend.run((context) => context.db.get(clash))).toEqual(
			clashBefore
		);
		const lonerRow = await backend.run((context) => context.db.get(loner));
		expect(lonerRow?.email).toBe("grace@example.com");
		const ada = await backend.run((context) =>
			context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", "ada@example.com")
				)
				.collect()
		);
		expect(ada.map((person) => person._id)).toEqual([holder]);
		expect(
			await backend.query(internal.migrations.previewEmailCase, {})
		).toMatchObject({ nonCanonical: [{ _id: clash }] });
	});

	it("counts the second of two variants that only collide with each other", async () => {
		const backend = createTester();
		const first = await seedPerson(backend, "Ada@example.com");
		const second = await seedPerson(backend, "ADA@example.com");

		expect(
			await backend.mutation(internal.migrations.migrateEmailCase, {})
		).toEqual({ peoplePatched: 1, collisions: 1, isDone: true });
		const firstRow = await backend.run((context) => context.db.get(first));
		expect(firstRow?.email).toBe("ada@example.com");
		const secondRow = await backend.run((context) =>
			context.db.get(second)
		);
		expect(secondRow?.email).toBe("ADA@example.com");
	});

	it("walks every page by scheduling itself", async () => {
		const backend = createTester();
		const total = 250;
		await backend.run(async (context) => {
			for (let index = 0; index < total; index++) {
				await context.db.insert("people", {
					email: `Paged${String(index)}@Example.com`,
					firstName: "Paged",
					lastName: "Person",
					tier: "visitor",
					stage: "verified",
					stageSince: 1,
				});
			}
		});

		let first: unknown;
		await runAndCollectLogs(backend, async () => {
			first = await backend.mutation(
				internal.migrations.migrateEmailCase,
				{}
			);
		});
		expect(first).toEqual({
			peoplePatched: 100,
			collisions: 0,
			isDone: false,
		});

		const people = await backend.run((context) =>
			context.db.query("people").collect()
		);
		expect(people).toHaveLength(total);
		expect(
			people.filter(
				(person) => person.email !== normalizeEmail(person.email)
			)
		).toEqual([]);
	});
});

describe("backfillActivatedAt", () => {
	it("stamps active rows from stageSince and others from their history", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => {
			const base = {
				firstName: "X",
				lastName: "Y",
				stageSince: 100,
			} as const;
			const active = await context.db.insert("people", {
				...base,
				email: "a@example.com",
				tier: "member",
				stage: "active",
			});
			const expired = await context.db.insert("people", {
				...base,
				email: "e@example.com",
				tier: "guest",
				stage: "expired",
			});
			await context.db.insert("personEvents", {
				personId: expired,
				at: 50,
				kind: "transition",
				event: "ONBOARDING_PROGRESSED",
				from: "guest.onboarding",
				to: "guest.active",
			});
			const neverActive = await context.db.insert("people", {
				...base,
				email: "n@example.com",
				tier: "guest",
				stage: "expired",
			});
			const former = await context.db.insert("people", {
				...base,
				email: "f@example.com",
				tier: "former",
				stage: "active",
				formerOf: "member",
				formerReason: "left",
			});
			await context.db.insert("personEvents", {
				personId: former,
				at: 70,
				kind: "transition",
				event: "ONBOARDING_PROGRESSED",
				from: "member.onboarding",
				to: "member.active",
			});
			const leftEarly = await context.db.insert("people", {
				...base,
				email: "l@example.com",
				tier: "former",
				stage: "active",
				formerOf: "member",
				formerReason: "left",
			});
			await context.db.insert("personEvents", {
				personId: leftEarly,
				at: 60,
				kind: "transition",
				event: "KICK_OUT",
				from: "member.onboarding",
				to: "former.active",
			});
			const prospect = await context.db.insert("people", {
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
		await backend.mutation(internal.migrations.backfillActivatedAt, {});
		function get(id: Id<"people">) {
			return backend.run(async (context) => {
				const row = await context.db.get(id);
				return row?.activatedAt ?? null;
			});
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
		const backend = createTester();
		const id = await backend.run(async (context) => {
			const pid = await context.db.insert("people", {
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
			await context.db.insert("signatures", {
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
		await backend.mutation(
			internal.migrations.repairGuestWithoutAgreement,
			{
				personId: id,
			}
		);
		await backend.run(async (context) => {
			const row = await context.db.get(id);
			expect(row?.stage).toBe("onboarding");
			// The wizard must have the agreement left to ask for.
			expect(
				// eslint-disable-next-line id-length -- conventional comparator parameter names
				Object.keys(row?.onboarding?.steps ?? {}).sort((a, b) =>
					a.localeCompare(b)
				)
			).toEqual(["rules", "visit", "welcome"]);
			expect(row?.onboarding?.boardSteps).toEqual({
				whatsapp: { completedAt: 1 },
			});
			const events = await context.db.query("personEvents").collect();
			const event = events.find((item) => item.event === "REPAIR");
			expect(event).toMatchObject({
				kind: "transition",
				from: "guest.active",
				to: "guest.onboarding",
			});
		});
	});

	it("refuses a guest who has the guest agreement", async () => {
		const backend = createTester();
		const id = await backend.run(async (context) => {
			const pid = await context.db.insert("people", {
				email: "ok@example.com",
				firstName: "O",
				lastName: "K",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
			});
			await context.db.insert("signatures", {
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
			backend.mutation(internal.migrations.repairGuestWithoutAgreement, {
				personId: id,
			})
		).rejects.toThrow();
	});
});
