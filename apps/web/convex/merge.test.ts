import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { issueToken } from "./lib/confirmToken.ts";
import { setDoorProviderForTests } from "./lib/doorProvider.ts";
import { EMAIL_IN_USE } from "./lib/emailAddress.ts";
import {
	FAKE_SLOT_LOCK_IDS,
	FakeDoorProvider,
} from "./lib/fakeDoorProvider.ts";
import { MAX_SCANNED_DOCS, peopleReferenceTables } from "./lib/peopleRefs.ts";
import { isDryRunRollback } from "./merge.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type T = ReturnType<typeof convexTest>;

async function seed(backend: T) {
	return backend.run(async (context) => {
		const keep = await context.db.insert("people", {
			email: "keep@example.com",
			firstName: "K",
			lastName: "Keep",
			tier: "board",
			stage: "active",
			stageSince: 1,
			activatedAt: 1,
		});
		const drop = await context.db.insert("people", {
			email: "drop@example.com",
			firstName: "K",
			lastName: "Keep",
			tier: "member",
			stage: "active",
			stageSince: 1,
			activatedAt: 1,
			venture: { name: "Old Co" },
		});
		const guest = await context.db.insert("people", {
			email: "g@example.com",
			firstName: "G",
			lastName: "Guest",
			tier: "guest",
			stage: "active",
			stageSince: 1,
			activatedAt: 1,
			hostedById: drop,
			board: { noteLog: [{ at: 1, authorId: drop, text: "hi" }] },
			door: { override: "none", byId: drop },
			onboarding: {
				steps: {},
				boardSteps: { whatsapp: { completedAt: 1, byId: drop } },
			},
		});
		await context.db.insert("signatures", {
			personId: drop,
			email: "drop@example.com",
			variant: "member",
			signedName: "K Keep",
			agreementVersion: "t",
			agreementHash: "",
			signedAt: 1,
		});
		await context.db.insert("personEvents", {
			personId: drop,
			at: 1,
			actorId: drop,
			kind: "wifi",
		});
		await context.db.insert("tasks", {
			title: "t",
			status: "backlog",
			assigneeIds: [drop],
			createdBy: drop,
		});
		await context.db.insert("projects", {
			name: "p",
			leaderId: drop,
			createdBy: drop,
		});
		const event = await context.db.insert("events", {
			name: "e",
			startsAt: 1,
			endsAt: 2,
			startsAtLocal: "1970-01-01T00:00:00+00:00[UTC]",
			endsAtLocal: "1970-01-01T00:00:00+00:00[UTC]",
			createdBy: drop,
			createdAt: 1,
		});
		await context.db.insert("eventAttendance", {
			personId: drop,
			eventId: event,
			confirmedAt: 1,
		});
		await context.db.insert("personState", {
			personId: drop,
			lastPath: "/drop",
		});
		await issueToken(context, {
			token: "confirm",
			purpose: "eventInvite",
			personId: drop,
			eventId: event,
			ttlMs: 1000,
		});
		await context.db.insert("pushSubscriptions", {
			personId: drop,
			endpoint: "https://push.example/1",
			p256dh: "k",
			auth: "a",
			userAgent: "ua",
			createdAt: 1,
		});
		await context.db.insert("notifications", {
			personId: drop,
			kind: "taskAssigned",
			title: "New task assigned",
			body: "t",
			url: "/tasks",
			createdAt: 1,
		});
		const logRow = {
			at: 1,
			operation: "revoke",
			trigger: "lifecycle",
			personId: drop,
			actorId: drop,
			email: "drop@example.com",
			name: "K Keep",
			lockNames: [],
			outcome: "ok",
		} as const;
		await context.db.insert("doorLog", logRow);
		return { keep, drop, guest };
	});
}

function person(
	email: string,
	doorUserId?: string,
	tier: "board" | "member" = "board"
) {
	return {
		email,
		firstName: "P",
		lastName: "P",
		tier,
		stage: "active" as const,
		stageSince: 1,
		activatedAt: 1,
		...(doorUserId
			? { door: { override: "none" as const, doorUserId } }
			: {}),
	};
}

afterEach(() => {
	setDoorProviderForTests(undefined);
});

describe("merge", () => {
	it("moves every reference, patches the kept row, audits, and deletes the drop", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop, guest } = await seed(backend);
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {
				venture: { name: "Straintest" },
				email: " Keep@Example.com ",
			},
		});
		await backend.run(async (context) => {
			expect(await context.db.get(drop)).toBeNull();
			const kept = await context.db.get(keep);
			expect(kept?.email).toBe("keep@example.com");
			expect(kept?.venture?.name).toBe("Straintest");
			const guestRow = await context.db.get(guest);
			expect(guestRow?.hostedById).toBe(keep);
			expect(guestRow?.board?.noteLog?.[0]?.authorId).toBe(keep);
			expect(guestRow?.door?.byId).toBe(keep);
			expect(guestRow?.onboarding?.boardSteps?.whatsapp.byId).toBe(keep);
			for (const table of peopleReferenceTables()) {
				const tableRows = await context.db
					.query(table as "people")
					.collect();
				const documents = tableRows.filter(
					// The merge audit row names the dropped id on purpose.
					(document) =>
						(document as { kind?: string }).kind !== "merge"
				);
				expect(documents.length).toBeGreaterThan(0);
				expect(JSON.stringify(documents)).not.toContain(drop);
			}
			const auditEvents = await context.db
				.query("personEvents")
				.collect();
			const audit = auditEvents.find((event) => event.kind === "merge");
			expect(audit?.personId).toBe(keep);
			expect(audit?.meta).toEqual({
				dropId: drop,
				droppedEmail: "drop@example.com",
			});
		});
	});

	it("recomputes the kept person's signedVariants from the moved signatures", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await backend.run(async (context) => {
			const keep = await context.db.insert("people", {
				email: "keep2@example.com",
				firstName: "K",
				lastName: "Keep",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
			});
			const drop = await context.db.insert("people", {
				email: "drop2@example.com",
				firstName: "K",
				lastName: "Keep",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
				signedVariants: ["guest"],
			});
			await context.db.insert("signatures", {
				personId: drop,
				email: "drop2@example.com",
				variant: "guest",
				signedName: "K Keep",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
				sourceUrl: "https://example.com/guest.pdf",
			});
			return { keep, drop };
		});
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		const kept = await backend.run((context) => context.db.get(keep));
		expect(kept?.signedVariants).toEqual(["guest"]);
	});

	it("keeps both variants when the two people signed different ones", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await backend.run(async (context) => {
			const keep = await context.db.insert("people", {
				...person("keep3@example.com", undefined, "member"),
				signedVariants: ["member"],
			});
			const drop = await context.db.insert("people", {
				...person("drop3@example.com", undefined, "member"),
				signedVariants: ["guest"],
			});
			for (const [personId, email, variant] of [
				[keep, "keep3@example.com", "member"],
				[drop, "drop3@example.com", "guest"],
			] as const)
				await context.db.insert("signatures", {
					personId,
					email,
					variant,
					signedName: "P P",
					agreementVersion: "t",
					agreementHash: "",
					signedAt: 1,
					sourceUrl: `https://example.com/${variant}.pdf`,
				});
			return { keep, drop };
		});
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		const kept = await backend.run((context) => context.db.get(keep));
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			[...(kept?.signedVariants ?? [])].sort((a, b) => a.localeCompare(b))
		).toEqual(["guest", "member"]);
	});

	it("moves the dropped person's notification history to the kept person", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {
				venture: { name: "Straintest" },
				email: " Keep@jfloor.test ",
			},
		});
		const rows = await backend.run((context) =>
			context.db.query("notifications").collect()
		);
		expect(rows.map((row) => row.personId)).toEqual([keep]);
	});

	it("refuses a merge that leaves the kept row in a violated state, writing nothing", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		await expect(
			backend.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { tier: "guest" },
			})
		).rejects.toThrow(/Merge refused: active-without-agreement/);
		expect(
			await backend.run((context) => context.db.get(drop))
		).not.toBeNull();
	});

	it("check reports the same refusal without writing", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const result = await backend.query(internal.merge.check, {
			keepId: keep,
			dropId: drop,
			patch: { tier: "guest" },
		});
		expect(result.ok ? null : result.reason).toContain(
			"active-without-agreement"
		);
	});

	it("refuses to merge a person into themselves", async () => {
		const backend = convexTest(schema, modules);
		const { keep } = await seed(backend);
		await expect(
			backend.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: keep,
				patch: {},
			})
		).rejects.toThrow("Merge refused: Cannot merge a person into itself.");
	});

	it("refuses an email a third person already uses, but lets the kept row take the dropped row's", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		await backend.run((context) =>
			context.db.insert("people", person("third@example.com"))
		);
		const clash = await backend.query(internal.merge.check, {
			keepId: keep,
			dropId: drop,
			patch: { email: "Third@Example.com" },
		});
		expect(clash).toEqual({ ok: false, reason: EMAIL_IN_USE });
		await expect(
			backend.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { email: "third@example.com" },
			})
		).rejects.toThrow(/already uses/);
		expect(
			await backend.run((context) => context.db.get(drop))
		).not.toBeNull();

		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: { email: "DROP@example.com" },
		});
		const keptAfter = await backend.run((context) => context.db.get(keep));
		expect(keptAfter?.email).toBe("drop@example.com");
	});

	it("check refuses a patch that is not an object", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		expect(
			await backend.query(internal.merge.check, {
				keepId: keep,
				dropId: drop,
				patch: "nope",
			})
		).toEqual({ ok: false, reason: "The patch must be an object." });
	});

	it("a patch the people schema rejects fails the write, leaving the dropped row", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		for (const patch of [
			{ nickname: "K" },
			{ venture: { name: 3 } },
			{ stage: "nonsense" },
		]) {
			const attempt = backend.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch,
			});
			const error: unknown = await attempt.catch(
				(caught: unknown) => caught
			);
			expect(error).toBeInstanceOf(Error);
			expect(isDryRunRollback(error)).toBe(false);
		}
		expect(
			await backend.run((context) => context.db.get(drop))
		).not.toBeNull();
	});

	it("check refuses when the references are too many to walk in one transaction", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		await backend.run(async (context) => {
			for (let index = 0; index < MAX_SCANNED_DOCS; index++)
				await context.db.insert("personEvents", {
					personId: keep,
					at: index,
					kind: "wifi",
				});
		});
		const result = await backend.query(internal.merge.check, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		expect(result).toEqual({
			ok: false,
			reason: `Too many documents to scan in one transaction (more than ${MAX_SCANNED_DOCS}, reached in personEvents).`,
		});
	});

	it("refuses a dropped board or admin with door access, whose key would never be revoked", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => ({
			keep: await context.db.insert("people", person("a@example.com")),
			board: await context.db.insert(
				"people",
				person("b@example.com", "u2")
			),
		}));
		const reason = /break-glass key and would never be revoked/;
		const verdict = await backend.query(internal.merge.check, {
			keepId: ids.keep,
			dropId: ids.board,
			patch: {},
		});
		expect(verdict).toMatchObject({ ok: false });
		expect(JSON.stringify(verdict)).toMatch(reason);
		await expect(
			backend.mutation(internal.merge.apply, {
				keepId: ids.keep,
				dropId: ids.board,
				patch: {},
			})
		).rejects.toThrow(reason);
		expect(
			await backend.run((context) => context.db.get(ids.board))
		).not.toBeNull();
		// Taking the dropped row's email makes its account the kept person's.
		expect(
			await backend.query(internal.merge.check, {
				keepId: ids.keep,
				dropId: ids.board,
				patch: { email: "b@example.com" },
			})
		).toEqual({
			ok: true,
			keptEmail: "b@example.com",
			revokeDropped: false,
			revokeKept: false,
		});
	});

	it("a dry run does every write, then rolls all of them back", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop, guest } = await seed(backend);
		const rollback: unknown = await backend
			.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { venture: { name: "Straintest" } },
				dryRun: true,
			})
			.catch((caught: unknown) => caught);
		expect(isDryRunRollback(rollback)).toBe(true);
		await backend.run(async (context) => {
			expect(await context.db.get(drop)).not.toBeNull();
			const keptPerson = await context.db.get(keep);
			const guestPerson = await context.db.get(guest);
			expect(keptPerson?.venture).toBeUndefined();
			expect(guestPerson?.hostedById).toBe(drop);
			const events = await context.db.query("personEvents").collect();
			expect(events.some((event) => event.kind === "merge")).toBe(false);
			expect(events.every((event) => event.personId === drop)).toBe(true);
		});
	});

	it("check says whether the dropped row's door account is the kept person's", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => ({
			keep: await context.db.insert(
				"people",
				person("a@example.com", "u1")
			),
			shared: await context.db.insert(
				"people",
				person("b@example.com", "u1", "member")
			),
			other: await context.db.insert(
				"people",
				person("c@example.com", "u2", "member")
			),
			bare: await context.db.insert(
				"people",
				person("d@example.com", undefined, "member")
			),
		}));
		function verdict(dropId: Id<"people">) {
			return backend.query(internal.merge.check, {
				keepId: ids.keep,
				dropId,
				patch: {},
			});
		}
		expect(await verdict(ids.shared)).toEqual({
			ok: true,
			keptEmail: "a@example.com",
			revokeDropped: false,
			revokeKept: false,
		});
		expect(await verdict(ids.other)).toEqual({
			ok: true,
			keptEmail: "a@example.com",
			revokeDropped: true,
			revokeKept: false,
		});
		expect(await verdict(ids.bare)).toEqual({
			ok: true,
			keptEmail: "a@example.com",
			revokeDropped: true,
			revokeKept: false,
		});
		// Taking the dropped row's email makes its provider account the kept person's.
		expect(
			await backend.query(internal.merge.check, {
				keepId: ids.keep,
				dropId: ids.bare,
				patch: { email: "d@example.com" },
			})
		).toEqual({
			ok: true,
			keptEmail: "d@example.com",
			revokeDropped: false,
			revokeKept: false,
		});
	});
});

describe("merge side effects", () => {
	it("stores the kept row's email lowercased even when the patch leaves it alone", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => ({
			keep: await context.db.insert(
				"people",
				person("Shane@Example.com")
			),
			drop: await context.db.insert(
				"people",
				person("shane@example.com", undefined, "member")
			),
		}));
		await backend.mutation(internal.merge.apply, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});
		const keptPerson = await backend.run((context) =>
			context.db.get(ids.keep)
		);
		expect(keptPerson?.email).toBe("shane@example.com");
	});

	it("names the kept person once in a task both were assigned to", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const task = await backend.run((context) =>
			context.db.insert("tasks", {
				title: "both",
				status: "backlog",
				assigneeIds: [keep, drop],
				createdBy: keep,
			})
		);
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		const reassigned = await backend.run((context) => context.db.get(task));
		expect(reassigned?.assigneeIds).toEqual([keep]);
	});

	it("keeps one attendance when both people had them for an event", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const event = await backend.run(async (context) => {
			const [row] = await context.db.query("eventAttendance").collect();
			await context.db.insert("eventAttendance", {
				personId: keep,
				eventId: row.eventId,
				confirmedAt: 2,
			});
			return row.eventId;
		});
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		await backend.run(async (context) => {
			const attendance = await context.db
				.query("eventAttendance")
				.withIndex("by_event", (range) => range.eq("eventId", event))
				.collect();
			expect(
				attendance.map((row) => [row.personId, row.confirmedAt])
			).toEqual([[keep, 2]]);
		});
	});
});

describe("merge personState", () => {
	it("keeps the kept person's row when both people had one", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		await backend.run((context) =>
			context.db.insert("personState", {
				personId: keep,
				lastPath: "/keep",
			})
		);
		await backend.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		await backend.run(async (context) => {
			const rows = await context.db.query("personState").collect();
			expect(rows.map((row) => [row.personId, row.lastPath])).toEqual([
				[keep, "/keep"],
			]);
		});
	});
});

describe("merge.run", () => {
	const DN = FAKE_SLOT_LOCK_IDS.downstairs;

	function account(email: string): FakeDoorProvider {
		return new FakeDoorProvider({
			identities: [
				{
					providerUserId: "u1",
					email,
					authIds: [{ lockId: DN, authId: "a-dn" }],
				},
			],
			locks: [{ lockId: DN, name: "J Floor City - Downstairs" }],
		});
	}

	it("revokes the dropped row's door keys while it still exists, then applies", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		const result = await backend.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { venture: { name: "Straintest" } },
		});

		expect(result.moved).toBeGreaterThan(0);
		// Only possible while the row exists: the revoke resolves the email by id.
		expect(fake.calls.revokes).toEqual([["a-dn"]]);
		await backend.run(async (context) => {
			expect(await context.db.get(drop)).toBeNull();
			const logged = await context.db.query("doorLog").collect();
			expect(logged.map((row) => row.personId)).toEqual([keep, keep]);
		});
	});

	it("leaves the provider account alone when it is the kept person's", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		await backend.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { email: "drop@example.com" },
		});

		expect(fake.calls.revokes).toEqual([]);
		expect(await backend.run((context) => context.db.get(drop))).toBeNull();
	});

	it("spares a provider account carrying the kept person's email even when the dropped row points at it", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => {
			const keep = await context.db.insert(
				"people",
				person("keep@example.com", "stale-1", "member")
			);
			await context.db.insert("signatures", {
				personId: keep,
				email: "keep@example.com",
				variant: "member",
				signedName: "P P",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
			});
			const drop = await context.db.insert(
				"people",
				person("drop@example.com", "acct-1", "member")
			);
			return { keep, drop };
		});
		const fake = new FakeDoorProvider({
			identities: [
				{
					providerUserId: "acct-1",
					email: "keep@example.com",
					authIds: [{ lockId: DN, authId: "a1" }],
				},
			],
			locks: [{ lockId: DN, name: "J Floor City - Downstairs" }],
		});
		setDoorProviderForTests(fake);

		await backend.action(internal.merge.run, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});

		expect(fake.calls.revokes.flat()).not.toContain("a1");
		expect(
			await backend.run((context) => context.db.get(ids.drop))
		).toBeNull();
	});

	it("revokes the kept person when the shared account held the dropped board member's break-glass key", async () => {
		const backend = convexTest(schema, modules);
		const ids = await backend.run(async (context) => ({
			keep: await context.db.insert(
				"people",
				person("drop@example.com", "u1", "member")
			),
			drop: await context.db.insert(
				"people",
				person("Drop@Example.com", "u1")
			),
		}));
		await backend.run((context) =>
			context.db.insert("signatures", {
				personId: ids.keep,
				email: "drop@example.com",
				variant: "member",
				signedName: "P P",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
			})
		);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);
		expect(
			await backend.query(internal.merge.check, {
				keepId: ids.keep,
				dropId: ids.drop,
				patch: {},
			})
		).toEqual({
			ok: true,
			keptEmail: "drop@example.com",
			revokeDropped: false,
			revokeKept: true,
		});

		await backend.action(internal.merge.run, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});

		expect(fake.calls.revokes).toEqual([["a-dn"]]);
		const logged = await backend.run((context) =>
			context.db.query("doorLog").collect()
		);
		expect(logged.map((row) => row.personId)).toEqual([ids.keep]);
	});

	it("revokes nothing when the merge is refused", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		await expect(
			backend.action(internal.merge.run, {
				keepId: keep,
				dropId: drop,
				patch: { tier: "guest" },
			})
		).rejects.toThrow(/Merge refused: active-without-agreement/);

		expect(fake.calls.revokes).toEqual([]);
		expect(
			await backend.run((context) => context.db.get(drop))
		).not.toBeNull();
	});

	it("revokes nothing when the dry run fails on a patch the schema rejects", async () => {
		const backend = convexTest(schema, modules);
		const { keep, drop } = await seed(backend);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		const attempt = backend.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { nickname: "K" },
		});
		const error: unknown = await attempt.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(Error);
		expect(isDryRunRollback(error)).toBe(false);

		expect(fake.calls.revokes).toEqual([]);
		expect(
			await backend.run((context) => context.db.get(drop))
		).not.toBeNull();
	});
});
