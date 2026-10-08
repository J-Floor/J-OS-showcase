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
import { MAX_SCANNED_DOCS, peopleRefTables } from "./lib/peopleRefs.ts";
import { isDryRunRollback } from "./merge.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

type T = ReturnType<typeof convexTest>;

async function seed(t: T) {
	return t.run(async (ctx) => {
		const keep = await ctx.db.insert("people", {
			email: "keep@example.com",
			firstName: "K",
			lastName: "Keep",
			tier: "board",
			stage: "active",
			stageSince: 1,
			activatedAt: 1,
		});
		const drop = await ctx.db.insert("people", {
			email: "drop@example.com",
			firstName: "K",
			lastName: "Keep",
			tier: "member",
			stage: "active",
			stageSince: 1,
			activatedAt: 1,
			venture: { name: "Old Co" },
		});
		const guest = await ctx.db.insert("people", {
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
		await ctx.db.insert("signatures", {
			personId: drop,
			email: "drop@example.com",
			variant: "member",
			signedName: "K Keep",
			agreementVersion: "t",
			agreementHash: "",
			signedAt: 1,
		});
		await ctx.db.insert("personEvents", {
			personId: drop,
			at: 1,
			actorId: drop,
			kind: "wifi",
		});
		await ctx.db.insert("tasks", {
			title: "t",
			status: "backlog",
			assigneeIds: [drop],
			createdBy: drop,
		});
		await ctx.db.insert("projects", {
			name: "p",
			leaderId: drop,
			createdBy: drop,
		});
		const event = await ctx.db.insert("events", {
			name: "e",
			startsAt: 1,
			endsAt: 2,
			startsAtLocal: "1970-01-01T00:00:00+00:00[UTC]",
			endsAtLocal: "1970-01-01T00:00:00+00:00[UTC]",
			createdBy: drop,
			createdAt: 1,
		});
		await ctx.db.insert("eventAttendance", {
			personId: drop,
			eventId: event,
			confirmedAt: 1,
		});
		await issueToken(ctx, {
			token: "confirm",
			purpose: "eventInvite",
			personId: drop,
			eventId: event,
			ttlMs: 1000,
		});
		await ctx.db.insert("pushSubscriptions", {
			personId: drop,
			endpoint: "https://push.example/1",
			p256dh: "k",
			auth: "a",
			userAgent: "ua",
			createdAt: 1,
		});
		await ctx.db.insert("notifications", {
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
		await ctx.db.insert("doorLog", logRow);
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
		const t = convexTest(schema, modules);
		const { keep, drop, guest } = await seed(t);
		await t.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {
				venture: { name: "Straintest" },
				email: " Keep@Example.com ",
			},
		});
		await t.run(async (ctx) => {
			expect(await ctx.db.get(drop)).toBeNull();
			const kept = await ctx.db.get(keep);
			expect(kept?.email).toBe("keep@example.com");
			expect(kept?.venture?.name).toBe("Straintest");
			const g = await ctx.db.get(guest);
			expect(g?.hostedById).toBe(keep);
			expect(g?.board?.noteLog?.[0]?.authorId).toBe(keep);
			expect(g?.door?.byId).toBe(keep);
			expect(g?.onboarding?.boardSteps?.whatsapp.byId).toBe(keep);
			for (const table of peopleRefTables()) {
				const docs = (
					await ctx.db.query(table as "people").collect()
				).filter(
					// The merge audit row names the dropped id on purpose.
					(d) => (d as { kind?: string }).kind !== "merge"
				);
				expect(docs.length).toBeGreaterThan(0);
				expect(JSON.stringify(docs)).not.toContain(drop);
			}
			const audit = (await ctx.db.query("personEvents").collect()).find(
				(e) => e.kind === "merge"
			);
			expect(audit?.personId).toBe(keep);
			expect(audit?.meta).toEqual({
				dropId: drop,
				droppedEmail: "drop@example.com",
			});
		});
	});

	it("moves the dropped person's notification history to the kept person", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		await t.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {
				venture: { name: "Straintest" },
				email: " Keep@jfloor.test ",
			},
		});
		const rows = await t.run((ctx) =>
			ctx.db.query("notifications").collect()
		);
		expect(rows.map((r) => r.personId)).toEqual([keep]);
	});

	it("refuses a merge that leaves the kept row in a violated state, writing nothing", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		await expect(
			t.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { tier: "guest" },
			})
		).rejects.toThrow(/Merge refused: active-without-agreement/);
		expect(await t.run((ctx) => ctx.db.get(drop))).not.toBeNull();
	});

	it("check reports the same refusal without writing", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const result = await t.query(internal.merge.check, {
			keepId: keep,
			dropId: drop,
			patch: { tier: "guest" },
		});
		expect(result.ok ? null : result.reason).toContain(
			"active-without-agreement"
		);
	});

	it("refuses to merge a person into themselves", async () => {
		const t = convexTest(schema, modules);
		const { keep } = await seed(t);
		await expect(
			t.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: keep,
				patch: {},
			})
		).rejects.toThrow("Merge refused: Cannot merge a person into itself.");
	});

	it("refuses an email a third person already uses, but lets the kept row take the dropped row's", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		await t.run((ctx) =>
			ctx.db.insert("people", person("third@example.com"))
		);
		const clash = await t.query(internal.merge.check, {
			keepId: keep,
			dropId: drop,
			patch: { email: "Third@Example.com" },
		});
		expect(clash).toEqual({ ok: false, reason: EMAIL_IN_USE });
		await expect(
			t.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { email: "third@example.com" },
			})
		).rejects.toThrow(/already uses/);
		expect(await t.run((ctx) => ctx.db.get(drop))).not.toBeNull();

		await t.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: { email: "DROP@example.com" },
		});
		expect((await t.run((ctx) => ctx.db.get(keep)))?.email).toBe(
			"drop@example.com"
		);
	});

	it("check refuses a patch that is not an object", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		expect(
			await t.query(internal.merge.check, {
				keepId: keep,
				dropId: drop,
				patch: "nope",
			})
		).toEqual({ ok: false, reason: "The patch must be an object." });
	});

	it("a patch the people schema rejects fails the write, leaving the dropped row", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		for (const patch of [
			{ nickname: "K" },
			{ venture: { name: 3 } },
			{ stage: "nonsense" },
		]) {
			const attempt = t.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch,
			});
			const error: unknown = await attempt.catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Error);
			expect(isDryRunRollback(error)).toBe(false);
		}
		expect(await t.run((ctx) => ctx.db.get(drop))).not.toBeNull();
	});

	it("check refuses when the references are too many to walk in one transaction", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		await t.run(async (ctx) => {
			for (let i = 0; i < MAX_SCANNED_DOCS; i++)
				await ctx.db.insert("personEvents", {
					personId: keep,
					at: i,
					kind: "wifi",
				});
		});
		const result = await t.query(internal.merge.check, {
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
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => ({
			keep: await ctx.db.insert("people", person("a@example.com")),
			board: await ctx.db.insert("people", person("b@example.com", "u2")),
		}));
		const reason = /break-glass key and would never be revoked/;
		const verdict = await t.query(internal.merge.check, {
			keepId: ids.keep,
			dropId: ids.board,
			patch: {},
		});
		expect(verdict).toMatchObject({ ok: false });
		expect(JSON.stringify(verdict)).toMatch(reason);
		await expect(
			t.mutation(internal.merge.apply, {
				keepId: ids.keep,
				dropId: ids.board,
				patch: {},
			})
		).rejects.toThrow(reason);
		expect(await t.run((ctx) => ctx.db.get(ids.board))).not.toBeNull();
		// Taking the dropped row's email makes its account the kept person's.
		expect(
			await t.query(internal.merge.check, {
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
		const t = convexTest(schema, modules);
		const { keep, drop, guest } = await seed(t);
		const rollback: unknown = await t
			.mutation(internal.merge.apply, {
				keepId: keep,
				dropId: drop,
				patch: { venture: { name: "Straintest" } },
				dryRun: true,
			})
			.catch((e: unknown) => e);
		expect(isDryRunRollback(rollback)).toBe(true);
		await t.run(async (ctx) => {
			expect(await ctx.db.get(drop)).not.toBeNull();
			expect((await ctx.db.get(keep))?.venture).toBeUndefined();
			expect((await ctx.db.get(guest))?.hostedById).toBe(drop);
			const events = await ctx.db.query("personEvents").collect();
			expect(events.some((e) => e.kind === "merge")).toBe(false);
			expect(events.every((e) => e.personId === drop)).toBe(true);
		});
	});

	it("check says whether the dropped row's door account is the kept person's", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => ({
			keep: await ctx.db.insert("people", person("a@example.com", "u1")),
			shared: await ctx.db.insert(
				"people",
				person("b@example.com", "u1", "member")
			),
			other: await ctx.db.insert(
				"people",
				person("c@example.com", "u2", "member")
			),
			bare: await ctx.db.insert(
				"people",
				person("d@example.com", undefined, "member")
			),
		}));
		function verdict(dropId: Id<"people">) {
			return t.query(internal.merge.check, {
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
			await t.query(internal.merge.check, {
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
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => ({
			keep: await ctx.db.insert("people", person("Shane@Example.com")),
			drop: await ctx.db.insert(
				"people",
				person("shane@example.com", undefined, "member")
			),
		}));
		await t.mutation(internal.merge.apply, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});
		expect((await t.run((ctx) => ctx.db.get(ids.keep)))?.email).toBe(
			"shane@example.com"
		);
	});

	it("names the kept person once in a task both were assigned to", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const task = await t.run((ctx) =>
			ctx.db.insert("tasks", {
				title: "both",
				status: "backlog",
				assigneeIds: [keep, drop],
				createdBy: keep,
			})
		);
		await t.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		expect((await t.run((ctx) => ctx.db.get(task)))?.assigneeIds).toEqual([
			keep,
		]);
	});

	it("keeps one attendance when both people had them for an event", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const event = await t.run(async (ctx) => {
			const [row] = await ctx.db.query("eventAttendance").collect();
			await ctx.db.insert("eventAttendance", {
				personId: keep,
				eventId: row.eventId,
				confirmedAt: 2,
			});
			return row.eventId;
		});
		await t.mutation(internal.merge.apply, {
			keepId: keep,
			dropId: drop,
			patch: {},
		});
		await t.run(async (ctx) => {
			const attendance = await ctx.db
				.query("eventAttendance")
				.withIndex("by_event", (q) => q.eq("eventId", event))
				.collect();
			expect(attendance.map((a) => [a.personId, a.confirmedAt])).toEqual([
				[keep, 2],
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
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		const result = await t.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { venture: { name: "Straintest" } },
		});

		expect(result.moved).toBeGreaterThan(0);
		// Only possible while the row exists: the revoke resolves the email by id.
		expect(fake.calls.revokes).toEqual([["a-dn"]]);
		await t.run(async (ctx) => {
			expect(await ctx.db.get(drop)).toBeNull();
			const logged = await ctx.db.query("doorLog").collect();
			expect(logged.map((l) => l.personId)).toEqual([keep, keep]);
		});
	});

	it("leaves the provider account alone when it is the kept person's", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		await t.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { email: "drop@example.com" },
		});

		expect(fake.calls.revokes).toEqual([]);
		expect(await t.run((ctx) => ctx.db.get(drop))).toBeNull();
	});

	it("spares a provider account carrying the kept person's email even when the dropped row points at it", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const keep = await ctx.db.insert(
				"people",
				person("keep@example.com", "stale-1", "member")
			);
			await ctx.db.insert("signatures", {
				personId: keep,
				email: "keep@example.com",
				variant: "member",
				signedName: "P P",
				agreementVersion: "t",
				agreementHash: "",
				signedAt: 1,
			});
			const drop = await ctx.db.insert(
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

		await t.action(internal.merge.run, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});

		expect(fake.calls.revokes.flat()).not.toContain("a1");
		expect(await t.run((ctx) => ctx.db.get(ids.drop))).toBeNull();
	});

	it("revokes the kept person when the shared account held the dropped board member's break-glass key", async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => ({
			keep: await ctx.db.insert(
				"people",
				person("drop@example.com", "u1", "member")
			),
			drop: await ctx.db.insert(
				"people",
				person("Drop@Example.com", "u1")
			),
		}));
		await t.run((ctx) =>
			ctx.db.insert("signatures", {
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
			await t.query(internal.merge.check, {
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

		await t.action(internal.merge.run, {
			keepId: ids.keep,
			dropId: ids.drop,
			patch: {},
		});

		expect(fake.calls.revokes).toEqual([["a-dn"]]);
		const logged = await t.run((ctx) => ctx.db.query("doorLog").collect());
		expect(logged.map((l) => l.personId)).toEqual([ids.keep]);
	});

	it("revokes nothing when the merge is refused", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		await expect(
			t.action(internal.merge.run, {
				keepId: keep,
				dropId: drop,
				patch: { tier: "guest" },
			})
		).rejects.toThrow(/Merge refused: active-without-agreement/);

		expect(fake.calls.revokes).toEqual([]);
		expect(await t.run((ctx) => ctx.db.get(drop))).not.toBeNull();
	});

	it("revokes nothing when the dry run fails on a patch the schema rejects", async () => {
		const t = convexTest(schema, modules);
		const { keep, drop } = await seed(t);
		const fake = account("drop@example.com");
		setDoorProviderForTests(fake);

		const attempt = t.action(internal.merge.run, {
			keepId: keep,
			dropId: drop,
			patch: { nickname: "K" },
		});
		const error: unknown = await attempt.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(Error);
		expect(isDryRunRollback(error)).toBe(false);

		expect(fake.calls.revokes).toEqual([]);
		expect(await t.run((ctx) => ctx.db.get(drop))).not.toBeNull();
	});
});
