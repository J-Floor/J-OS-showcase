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

/** A requester, a board member who moved requests, a perk, and requests
 *  written raw with no events: how rows from before the log look. */
async function seedLegacy(backend: Tester) {
	return backend.run(async (context) => {
		const person = {
			lastName: "Example",
			tier: "member",
			stage: "active",
			stageSince: 1,
		} as const;
		const requesterId = await context.db.insert("people", {
			...person,
			email: "ada@example.com",
			firstName: "Ada",
		});
		const boardId = await context.db.insert("people", {
			...person,
			email: "bo@example.com",
			firstName: "Bo",
			tier: "board",
		});
		const perkId = await context.db.insert("perks", {
			partner: "Example Cloud",
			title: "Cloud credits",
			terms: "Credits for the first year.",
			category: "cloud",
			createdAt: 1,
		});
		const grantedId = await context.db.insert("perkRequests", {
			perkId,
			personId: requesterId,
			requestedAt: 1000,
			status: "granted",
			statusAt: 2000,
			statusById: boardId,
		});
		const openId = await context.db.insert("perkRequests", {
			perkId,
			personId: requesterId,
			requestedAt: 3000,
			status: "requested",
			statusAt: 3000,
		});
		return { requesterId, boardId, perkId, grantedId, openId };
	});
}

async function perkEvents(backend: Tester) {
	const rows = await backend.run((context) =>
		context.db
			.query("personEvents")
			.withIndex("by_kind_and_at", (range) => range.eq("kind", "perk"))
			.collect()
	);
	return rows.map(
		({ personId, actorId, event, perkRequestId, meta, at }) => ({
			personId,
			actorId,
			event,
			perkRequestId,
			meta: meta as { perkId: Id<"perks"> },
			at,
		})
	);
}

describe("backfillPerkEvents", () => {
	it("writes Requested by the requester, then the current status by whoever set it", async () => {
		const backend = createTester();
		const ids = await seedLegacy(backend);
		const result = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{}
		);
		expect(result).toEqual(
			expect.objectContaining({ requests: 2, events: 3, isDone: true })
		);
		const shared = {
			personId: ids.requesterId,
			meta: { perkId: ids.perkId },
		};
		expect(await perkEvents(backend)).toEqual([
			{
				...shared,
				actorId: ids.requesterId,
				event: "requested",
				perkRequestId: ids.grantedId,
				at: 1000,
			},
			{
				...shared,
				actorId: ids.boardId,
				event: "granted",
				perkRequestId: ids.grantedId,
				at: 2000,
			},
			{
				...shared,
				actorId: ids.requesterId,
				event: "requested",
				perkRequestId: ids.openId,
				at: 3000,
			},
		]);
	});

	it("reports what it would write on a dry run, and writes nothing", async () => {
		const backend = createTester();
		await seedLegacy(backend);
		const result = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{ dryRun: true }
		);
		expect(result).toEqual(
			expect.objectContaining({
				requests: 2,
				events: 3,
				isDone: true,
				dryRun: true,
			})
		);
		expect(await perkEvents(backend)).toEqual([]);
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toEqual([]);
	});

	it("skips a request that already has its events, so a re-run is a no-op", async () => {
		const backend = createTester();
		const ids = await seedLegacy(backend);
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: ids.requesterId,
				actorId: ids.requesterId,
				at: 3000,
				kind: "perk",
				event: "requested",
				perkRequestId: ids.openId,
				meta: { perkId: ids.perkId },
			});
		});
		const first = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{}
		);
		expect(first).toEqual(
			expect.objectContaining({ requests: 1, events: 2 })
		);
		const second = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{}
		);
		expect(second).toEqual(
			expect.objectContaining({ requests: 0, events: 0 })
		);
		// The one seeded, and the granted request's two.
		expect(await perkEvents(backend)).toHaveLength(3);
	});

	it("a request moved before the backfill keeps a Requested, and a re-run writes nothing", async () => {
		const backend = createTester();
		const ids = await seedLegacy(backend);
		// Granted after the deploy: the move logged its own step only.
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: ids.requesterId,
				actorId: ids.boardId,
				at: 2000,
				kind: "perk",
				event: "granted",
				perkRequestId: ids.grantedId,
				meta: { perkId: ids.perkId },
			});
		});
		const first = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{}
		);
		expect(first).toEqual(
			expect.objectContaining({ requests: 2, events: 2 })
		);
		const events = await perkEvents(backend);
		const granted = events.filter(
			(row) => row.perkRequestId === ids.grantedId
		);
		expect(granted.map((row) => [row.event, row.actorId, row.at])).toEqual([
			["requested", ids.requesterId, 1000],
			["granted", ids.boardId, 2000],
		]);
		const second = await backend.mutation(
			internal.migrations.backfillPerkEvents,
			{}
		);
		expect(second).toEqual(
			expect.objectContaining({ requests: 0, events: 0 })
		);
		expect(await perkEvents(backend)).toHaveLength(3);
	});

	it("a request with its Requested logged gets only its current status", async () => {
		const backend = createTester();
		const ids = await seedLegacy(backend);
		await backend.run(async (context) => {
			await context.db.insert("personEvents", {
				personId: ids.requesterId,
				actorId: ids.requesterId,
				at: 1000,
				kind: "perk",
				event: "requested",
				perkRequestId: ids.grantedId,
				meta: { perkId: ids.perkId },
			});
		});
		await backend.mutation(internal.migrations.backfillPerkEvents, {});
		const events = await perkEvents(backend);
		const granted = events.filter(
			(row) => row.perkRequestId === ids.grantedId
		);
		expect(granted.map((row) => row.event)).toEqual([
			"requested",
			"granted",
		]);
	});

	it("walks every page by scheduling itself", async () => {
		const backend = createTester();
		const ids = await seedLegacy(backend);
		const extra = 150;
		await backend.run(async (context) => {
			for (let index = 0; index < extra; index++) {
				await context.db.insert("perkRequests", {
					perkId: ids.perkId,
					personId: ids.requesterId,
					requestedAt: 4000 + index,
					status: "requested",
					statusAt: 4000 + index,
				});
			}
		});
		let first: unknown;
		await runAndCollectLogs(backend, async () => {
			first = await backend.mutation(
				internal.migrations.backfillPerkEvents,
				{}
			);
		});
		expect(first).toEqual(expect.objectContaining({ isDone: false }));
		expect(await perkEvents(backend)).toHaveLength(3 + extra);
	});
});
