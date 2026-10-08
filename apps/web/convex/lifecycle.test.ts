// apps/web/convex/lifecycle.test.ts
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { entitled } from "./lib/derive.ts";
import { violations } from "./lib/invariants.ts";
import { utcFromLocal } from "./lib/time.ts";
import { applyEvent } from "./lifecycle.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const DAY = 86_400_000;

async function setup() {
	const t = convexTest(schema, modules);
	const boardId = await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return {
		t,
		asBoard: t.withIdentity({ email: "board@example.com" }),
		boardId,
	};
}

async function insertProspect(
	t: TestConvex<typeof schema>,
	stage: "unverified" | "verified"
) {
	return t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "prospect",
			stage,
			stageSince: Date.now(),
			venture: { name: "Engine Co" },
			verifiedAt: stage === "verified" ? Date.now() : undefined,
		})
	);
}

async function eventsFor(t: TestConvex<typeof schema>, personId: string) {
	return t.run(async (ctx) =>
		ctx.db
			.query("personEvents")
			.withIndex("by_person", (q) => q.eq("personId", personId as never))
			.collect()
	);
}

/**
 * Every job an effect queued, straight off the `_scheduled_functions` system
 * table. `convex-test` records a row here at `runAfter`/`runAt` time and only
 * ever EXECUTES it if the test calls `finishAllScheduledFunctions` — which
 * this file deliberately never does (the door provider isn't stubbed here). So this is the
 * only way to prove an effect scheduled the RIGHT function with the RIGHT
 * args, as opposed to just proving `personEvents` got a row: swapping
 * `sendMemberUpgradeEmail` for `sendApprovalEmail` in the executor still
 * passes a test that only checks `meta`, because both write the same
 * `{ meta: "memberUpgrade" }` audit row — only the scheduled job's `name`
 * catches that.
 *
 * `args` is an array wrapping the single object passed to the scheduler call
 * (`[{ email: "..." }]`, not `{ email: "..." }`), which is convex-test's own
 * storage shape, not anything this codebase controls.
 */
async function scheduledJobs(t: TestConvex<typeof schema>) {
	return t.run((ctx) =>
		ctx.db.system.query("_scheduled_functions").collect()
	);
}

describe("transition", () => {
	it("moves a verified prospect to guest onboarding, opens the window and records the host", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await insertProspect(t, "verified");
		const until = Date.now() + 30 * DAY;

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_GUEST", until, hostedById: boardId },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("guest");
		expect(person?.stage).toBe("onboarding");
		expect(person?.accessUntil).toBe(until);
		// Model B: `accessUntilLocal` is the zoned source-of-truth the epoch was
		// derived from, so it must round-trip back to the same epoch.
		expect(person?.accessUntilLocal).toBeTypeOf("string");
		expect(utcFromLocal(person?.accessUntilLocal ?? "")).toBe(until);
		// I7: the host must survive the approval.
		expect(person?.hostedById).toBe(boardId);

		// SCHEDULE_WINDOW_EXPIRY, RECONCILE_DOOR and EMAIL:approval all fired —
		// asserting the JOBS, not just the `personEvents` row, is what would
		// catch the wrong function being scheduled (e.g. `windowExpired` never
		// scheduled, or the door never reconciled on the transition that turns
		// access ON).
		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "lifecycle:windowExpired",
					args: [{ personId: id }],
				}),
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: id,
							trigger: "lifecycle",
							detail: "APPROVE_GUEST",
						},
					],
				}),
				expect.objectContaining({
					name: "notifications:sendApprovalEmail",
					args: [{ email: "ada@example.com" }],
				}),
			])
		);
	});

	it("approves an open-ended guest: window open, nothing scheduled to close it", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_GUEST", hostedById: boardId },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("guest");
		expect(person?.stage).toBe("onboarding");
		// The window OPENED — `accessFrom` is stamped — it simply never closes.
		expect(person?.accessFrom).toBeTypeOf("number");
		expect(person?.accessUntil).toBeUndefined();
		expect(person?.accessUntilLocal).toBeUndefined();
		expect(person?.hostedById).toBe(boardId);

		const jobs = await scheduledJobs(t);
		// No expiry job: there is no instant to fire at. The door still
		// reconciles and the approval email still goes — this is a full
		// approval, not a partial one.
		expect(jobs.some((j) => j.name === "lifecycle:windowExpired")).toBe(
			false
		);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: id,
							trigger: "lifecycle",
							detail: "APPROVE_GUEST",
						},
					],
				}),
				expect.objectContaining({
					name: "notifications:sendApprovalEmail",
					args: [{ email: "ada@example.com" }],
				}),
			])
		);
	});

	it("refuses an illegal transition and writes nothing", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "unverified");

		await expect(
			asBoard.mutation(api.lifecycle.transition, {
				personId: id,
				event: { type: "APPROVE_MEMBER" },
			})
		).rejects.toThrow(/Illegal transition/);

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("unverified");
		expect(await eventsFor(t, id)).toHaveLength(0);
	});

	it("leaves a fresh applicant without an onboarding record on approval", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_MEMBER" },
		});

		expect(
			(await t.run((ctx) => ctx.db.get(id)))?.onboarding
		).toBeUndefined();
	});

	it("appends an audit row naming the actor", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_MEMBER" },
		});

		const events = await eventsFor(t, id);
		expect(events.filter((e) => e.kind === "transition")).toMatchObject([
			{
				event: "APPROVE_MEMBER",
				from: "prospect.verified",
				to: "member.onboarding",
				actorId: boardId,
			},
		]);
	});

	it("writes an email audit row and schedules the approval email for every lifecycle email it sends", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_MEMBER" },
		});

		const emails = (await eventsFor(t, id)).filter(
			(e) => e.kind === "email"
		);
		expect(emails).toMatchObject([{ meta: "approval" }]);

		// The audit row alone doesn't prove the RIGHT function was scheduled —
		// see `scheduledJobs`'s doc comment.
		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendApprovalEmail",
					args: [{ email: "ada@example.com" }],
				}),
			])
		);
	});

	it("re-opens the document step and clears the window on promotion", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() + 30 * DAY,
				accessUntilLocal: "2026-10-18T00:00:01[Europe/Zurich]",
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
					tourSeen: true,
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "ada@example.com",
				variant: "guest",
				signedName: "Ada Lovelace",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "PROMOTE_TO_MEMBER" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("member");
		expect(person?.stage).toBe("onboarding");
		expect(person?.accessUntil).toBeUndefined();
		// CLEAR_WINDOW must clear the Model B local alongside the epoch, or a
		// stale zoned value would survive a cleared window.
		expect(person?.accessUntilLocal).toBeUndefined();
		expect(person?.onboarding?.steps.document).toBeUndefined();
		// Space facts survive; the tour never runs twice.
		expect(person?.onboarding?.steps.rules).toBeDefined();
		expect(person?.onboarding?.tourSeen).toBe(true);
		expect(
			(await eventsFor(t, id)).filter((e) => e.kind === "email")
		).toMatchObject([{ meta: "memberUpgrade" }]);
		// The exact swap this task exists to prevent: `sendApprovalEmail`
		// scheduled instead of `sendMemberUpgradeEmail` on promotion. A test
		// that only checks the `personEvents` `meta` field cannot catch this,
		// since both write the identical `{ meta: "memberUpgrade" }` row.
		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendMemberUpgradeEmail",
					args: [{ email: "ada@example.com" }],
				}),
			])
		);
	});

	it("remembers the tier a kicked person held, so re-admit restores it", async () => {
		// Regression for the bug where SET_FORMER read the ALREADY-PATCHED row,
		// found tier === "former", and stored formerOf: undefined — after which
		// RE_ADMIT defaulted every kicked core member back to plain member.
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "cora@example.com",
				firstName: "Cora",
				lastName: "Member",
				tier: "core",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() + 30 * DAY,
				accessUntilLocal: "2026-10-18T00:00:01[Europe/Zurich]",
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "KICK_OUT" },
		});

		const kicked = await t.run(async (ctx) => ctx.db.get(id));
		expect(kicked?.tier).toBe("former");
		expect(kicked?.formerOf).toBe("core");
		expect(kicked?.formerReason).toBe("kicked");
		expect(kicked?.accessUntil).toBeUndefined();
		// SET_FORMER must clear the Model B local alongside the epoch.
		expect(kicked?.accessUntilLocal).toBeUndefined();

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "RE_ADMIT" },
		});
		const readmitted = await t.run(async (ctx) => ctx.db.get(id));
		expect(readmitted?.tier).toBe("core");
		// Cora has NO signature on file, so RE_ADMIT must land her in onboarding,
		// not active. Facts are computed from the pre-transition row, whose tier is
		// `former` — and `former` requires no agreement and no self steps, so a
		// naive loadFacts makes canActivate unconditionally true and re-admits
		// everybody straight into `.active` with no agreement. That is exactly the
		// "member with no agreement on file" failure the spec exists to kill, and
		// this assertion is the only thing that catches it.
		expect(readmitted?.stage).toBe("onboarding");
	});

	it("remembers a kicked staff person, so the row stays legal and re-admit restores staff", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "sam@example.com",
				firstName: "Sam",
				lastName: "Staff",
				tier: "staff",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "KICK_OUT" },
		});

		const kicked = await t.run(async (ctx) => ctx.db.get(id));
		expect(kicked?.tier).toBe("former");
		expect(kicked?.formerOf).toBe("staff");
		if (!kicked) throw new Error("row vanished");
		expect(violations(kicked, [], Date.now())).toEqual([]);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "RE_ADMIT" },
		});
		const readmitted = await t.run(async (ctx) => ctx.db.get(id));
		expect(`${readmitted?.tier}.${readmitted?.stage}`).toBe("staff.active");
	});

	it("demotes a board member into onboarding when they hold no member agreement", async () => {
		// The integration half of the SET_ROLE guard. The pure reducer test can
		// only prove `canActivate` is consulted; THIS proves `loadFacts` computes
		// the facts against the TARGET tier. A board member never needed an
		// agreement (board has no variant), so evaluating compliance against
		// `board` returns "met" and drops them into member.active holding
		// nothing — the failure the spec exists to kill.
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ex-board@example.com",
				firstName: "Ex",
				lastName: "Board",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_ROLE", tier: "member" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("member");
		expect(person?.stage).toBe("onboarding");
	});

	it("schedules the per-person door revoke when a board member is demoted", async () => {
		// A demoted board member keeps door access as a member, but only
		// board/admin keep a break-glass key: the demotion must queue
		// revokeUnlessBreakGlass for them, or their break-glass key outlives
		// their board seat.
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ex-board@example.com",
				firstName: "Ex",
				lastName: "Board",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_ROLE", tier: "member" },
		});

		expect(await scheduledJobs(t)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: id,
							trigger: "lifecycle",
							detail: "SET_ROLE",
						},
					],
				}),
			])
		);
	});

	it("demotes a board member straight to active when the member agreement is on file", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "ex-board@example.com",
				firstName: "Ex",
				lastName: "Board",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "ex-board@example.com",
				variant: "member",
				signedName: "Ex Board",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_ROLE", tier: "member" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("member");
		expect(person?.stage).toBe("active");
	});

	it("round-trips between board and admin through active", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "staff@example.com",
				firstName: "Sta",
				lastName: "Ff",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_ROLE", tier: "admin" },
		});
		expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({
			tier: "admin",
			stage: "active",
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_ROLE", tier: "board" },
		});
		// Neither tier has an agreement variant or self steps, so neither may
		// detour through `.onboarding` — a state with no ONBOARDING_PROGRESSED
		// edge, i.e. one they could never leave.
		expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({
			tier: "board",
			stage: "active",
		});
	});

	it("does not re-stamp stageSince on a self-loop", async () => {
		// SET_SCORE is prospect.queued -> prospect.queued. `personStatus.since`
		// ("in this state 23 days") is the spec's only stuck-person signal, so a
		// board re-score must not reset it to zero.
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_SCORE" },
		});
		const first = await t.run(
			async (ctx) => (await ctx.db.get(id))?.stageSince
		);
		expect(first).toBeTypeOf("number");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "SET_SCORE" },
		});
		const second = await t.run(async (ctx) => ctx.db.get(id));
		expect(second?.stage).toBe("queued");
		expect(second?.stageSince).toBe(first);
	});

	it("undenies a denied prospect and clears deniedAt", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "denied",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
				deniedAt: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "UNDENY" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("queued");
		expect(person?.deniedAt).toBeUndefined();
	});

	it("verifies email, notifies the board, and schedules applicationReceived on VERIFY_EMAIL", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "unverified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "VERIFY_EMAIL" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("verified");

		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendApplicationReceivedEmail",
					args: [{ email: "ada@example.com" }],
				}),
				expect.objectContaining({
					name: "notify/dispatch:run",
					args: [
						{
							kind: "newApplication",
							payload: {
								// The board's "Review application" button deep-links
								// to this person's drawer, so the id has to travel
								// with the notification.
								personId: id,
								applicantName: "Ada Lovelace",
								venture: "Engine Co",
							},
						},
					],
				}),
			])
		);
	});

	it("denies a verified prospect, stamps deniedAt, and schedules the rejection email", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "verified");

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "DENY" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("denied");
		expect(person?.deniedAt).toBeTypeOf("number");

		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendRejectionEmail",
					args: [
						{
							email: "ada@example.com",
							name: "Ada",
							venture: "Engine Co",
						},
					],
				}),
			])
		);
	});

	it("reapplies a denied prospect, resets the score and reconciles the door", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "prospect",
				stage: "denied",
				stageSince: Date.now(),
				verifiedAt: Date.now(),
				deniedAt: Date.now(),
				board: { score: 7, notes: "promising" },
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "REAPPLY" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("unverified");
		expect(person?.board?.score).toBeUndefined();
		// RESET_SCORE clears only `score` — board notes are a separate field.
		expect(person?.board?.notes).toBe("promising");

		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: id,
							trigger: "lifecycle",
							detail: "REAPPLY",
						},
					],
				}),
			])
		);
	});

	it("reapplies from unverified as a self-loop, without materialising a board object", async () => {
		// This REAPPLY edge (prospect.unverified -> prospect.unverified) has no
		// RECONCILE_DOOR effect, unlike the prospect.denied one above — and
		// RESET_SCORE must not create `board: { score: undefined }` out of thin
		// air on a prospect who was never scored (dashboard noise).
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "unverified");
		const before = await t.run(async (ctx) => ctx.db.get(id));
		expect(before?.board).toBeUndefined();

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "REAPPLY" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("unverified");
		expect(person?.board).toBeUndefined();
	});

	it("stamps accessFrom once and never re-stamps it on EXTEND_WINDOW", async () => {
		const { t, asBoard } = await setup();
		const id = await insertProspect(t, "verified");
		const firstUntil = Date.now() + 30 * DAY;

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_GUEST", until: firstUntil },
		});
		const afterApprove = await t.run(async (ctx) => ctx.db.get(id));
		expect(afterApprove?.accessFrom).toBeTypeOf("number");
		const stampedFrom = afterApprove?.accessFrom;

		const laterUntil = firstUntil + 10 * DAY;
		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "EXTEND_WINDOW", until: laterUntil },
		});

		const afterExtend = await t.run(async (ctx) => ctx.db.get(id));
		expect(afterExtend?.accessUntil).toBe(laterUntil);
		// EXTEND_WINDOW reuses SET_WINDOW, so it must re-derive `accessUntilLocal`
		// from the NEW epoch too, not just leave the one from APPROVE_GUEST.
		expect(utcFromLocal(afterExtend?.accessUntilLocal ?? "")).toBe(
			laterUntil
		);
		// The "only stamp when absent" half of SET_WINDOW: extending the window
		// must not rewrite the start date, or the guest approval email's "from"
		// date and the Guests tab's "joined" column would both drift forward
		// every time the window is extended.
		expect(afterExtend?.accessFrom).toBe(stampedFrom);
	});

	it("grants core to a compliant member and reconciles the door", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "mia@example.com",
				firstName: "Mia",
				lastName: "Member",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "mia@example.com",
				variant: "member",
				signedName: "Mia Member",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "GRANT_CORE" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("core");
		expect(person?.stage).toBe("active");

		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "doorRevoke:revokeUnlessBreakGlass",
					args: [
						{
							personId: id,
							trigger: "lifecycle",
							detail: "GRANT_CORE",
						},
					],
				}),
			])
		);
	});

	it("revokes core, demoting a compliant core member to member.active", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "cal@example.com",
				firstName: "Cal",
				lastName: "Core",
				tier: "core",
				stage: "active",
				stageSince: Date.now(),
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "cal@example.com",
				variant: "member",
				signedName: "Cal Core",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "REVOKE_CORE" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("member");
		expect(person?.stage).toBe("active");
	});

	it("marks a member as left, distinct from being kicked out", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "leaving@example.com",
				firstName: "Lea",
				lastName: "Ving",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "MARK_LEFT" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("former");
		expect(person?.formerOf).toBe("member");
		expect(person?.formerReason).toBe("left");
	});

	it("promotes an active member to the board", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "riser@example.com",
				firstName: "Ris",
				lastName: "Er",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "PROMOTE_TO_BOARD" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.tier).toBe("board");
		expect(person?.stage).toBe("active");
	});

	it("activates a guest whose onboarding just completed", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "newguest@example.com",
				firstName: "New",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessUntil: Date.now() + 30 * DAY,
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						doorKey: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "newguest@example.com",
				variant: "guest",
				signedName: "New Guest",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "ONBOARDING_PROGRESSED" },
		});

		const person = await t.run(async (ctx) => ctx.db.get(id));
		expect(person?.stage).toBe("active");
	});

	it("activates a door-blocked guest who has done every step", async () => {
		// The step list IS the activation guard, and it no longer depends on the
		// door: a guest approved without door access onboards like anyone else.
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "blocked@example.com",
				firstName: "No",
				lastName: "Key",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessUntil: Date.now() + 30 * DAY,
				door: { override: "force_off" },
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "blocked@example.com",
				variant: "guest",
				signedName: "No Key",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "ONBOARDING_PROGRESSED" },
		});

		expect((await t.run(async (ctx) => ctx.db.get(id)))?.stage).toBe(
			"active"
		);
	});

	it("activates a guest WITH door access who has done every step — there is no door-key step to wait on", async () => {
		const { t, asBoard } = await setup();
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: "haskey@example.com",
				firstName: "Has",
				lastName: "Key",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessUntil: Date.now() + 30 * DAY,
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId,
				email: "haskey@example.com",
				variant: "guest",
				signedName: "Has Key",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "ONBOARDING_PROGRESSED" },
		});

		expect((await t.run(async (ctx) => ctx.db.get(id)))?.stage).toBe(
			"active"
		);
	});

	it("rejects a non-board caller", async () => {
		const { t } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "M",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await expect(
			t
				.withIdentity({ email: "m@example.com" })
				.mutation(api.lifecycle.transition, {
					personId: id,
					event: { type: "KICK_OUT" },
				})
		).rejects.toThrow(/Forbidden/);
	});
});

describe("windowExpired", () => {
	it("expires a guest whose window has closed", async () => {
		const { t } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "guest@example.com",
				firstName: "Gue",
				lastName: "St",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() - 1000,
			})
		);

		await t.mutation(internal.lifecycle.windowExpired, { personId: id });
		expect(await t.run(async (ctx) => (await ctx.db.get(id))?.stage)).toBe(
			"expired"
		);
	});

	it("no-ops when the window was extended after the job was scheduled", async () => {
		const { t } = await setup();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "guest@example.com",
				firstName: "Gue",
				lastName: "St",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() + DAY,
			})
		);

		await t.mutation(internal.lifecycle.windowExpired, { personId: id });
		expect(await t.run(async (ctx) => (await ctx.db.get(id))?.stage)).toBe(
			"active"
		);
		// A no-op must not pollute the timeline.
		expect(await eventsFor(t, id)).toHaveLength(0);
	});
});

describe("sweepExpiredWindows", () => {
	it("catches guests whose scheduled expiry never fired", async () => {
		const { t } = await setup();
		const { missedId, currentId } = await t.run(async (ctx) => {
			const missedId = await ctx.db.insert("people", {
				email: "missed@example.com",
				firstName: "Mis",
				lastName: "Sed",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() - 5 * DAY,
			});
			const currentId = await ctx.db.insert("people", {
				email: "current@example.com",
				firstName: "Cur",
				lastName: "Rent",
				tier: "guest",
				stage: "active",
				stageSince: Date.now(),
				accessUntil: Date.now() + 5 * DAY,
			});
			return { missedId, currentId };
		});

		expect(
			await t.mutation(internal.lifecycle.sweepExpiredWindows, {})
		).toEqual({
			expired: 1,
		});

		// The count alone doesn't prove the sweep expired the RIGHT guest —
		// swapping which one gets skipped would still return `{ expired: 1 }`.
		expect(
			await t.run(async (ctx) => (await ctx.db.get(missedId))?.stage)
		).toBe("expired");
		expect(
			await t.run(async (ctx) => (await ctx.db.get(currentId))?.stage)
		).toBe("active");
	});
});

describe("activatedAt", () => {
	async function insertPerson(
		t: TestConvex<typeof schema>,
		tier: "guest" | "member",
		stage: "onboarding" | "active",
		opts: { signed: boolean; stageSince?: number }
	) {
		return t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Member",
				tier,
				stage,
				stageSince: opts.stageSince ?? 1,
			});
			if (opts.signed) {
				await ctx.db.insert("signatures", {
					personId: pid,
					email: "m@example.com",
					variant: "member",
					signedName: "M Member",
					agreementVersion: "test",
					agreementHash: "",
					signedAt: 1,
				});
			}
			return pid;
		});
	}
	function get(t: TestConvex<typeof schema>, id: Id<"people">) {
		return t.run((ctx) => ctx.db.get(id));
	}

	it("stamps the same time as stageSince on first activation and never moves it", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "p@example.com",
				firstName: "P",
				lastName: "Prospect",
				tier: "prospect",
				stage: "verified",
				stageSince: 1,
				verifiedAt: 1,
			})
		);
		await t.run((ctx) =>
			applyEvent(ctx, id, { type: "SET_ROLE", tier: "board" })
		);
		const row = await get(t, id);
		expect(row?.stageSince).not.toBe(1);
		expect(row?.activatedAt).toBe(row?.stageSince);
		const first = row?.activatedAt;
		await t.run((ctx) =>
			applyEvent(ctx, id, { type: "SET_ROLE", tier: "admin" })
		);
		expect((await get(t, id))?.activatedAt).toBe(first);
	});

	it("does not stamp staff, so a staff person made a member still onboards", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run((ctx) =>
			ctx.db.insert("people", {
				email: "s@example.com",
				firstName: "S",
				lastName: "Staff",
				tier: "prospect",
				stage: "unverified",
				stageSince: 1,
			})
		);
		await t.run((ctx) =>
			applyEvent(ctx, id, { type: "SET_ROLE", tier: "staff" })
		);
		expect((await get(t, id))?.activatedAt).toBeUndefined();
		await t.run((ctx) =>
			applyEvent(ctx, id, { type: "SET_ROLE", tier: "member" })
		);
		const row = await get(t, id);
		expect(`${row?.tier}.${row?.stage}`).toBe("member.onboarding");
		expect(row?.activatedAt).toBeUndefined();
	});

	it("stamps the old stageSince when a row active before the backfill moves to another active state", async () => {
		const t = convexTest(schema, modules);
		const id = await insertPerson(t, "member", "active", {
			signed: true,
			stageSince: 12_345,
		});
		await t.run((ctx) => applyEvent(ctx, id, { type: "PROMOTE_TO_BOARD" }));
		const row = await get(t, id);
		expect(row?.tier).toBe("board");
		expect(row?.stageSince).not.toBe(12_345);
		expect(row?.activatedAt).toBe(12_345);
	});

	it("leaves activatedAt unset when landing in an onboarding stage", async () => {
		const t = convexTest(schema, modules);
		const id = await insertPerson(t, "guest", "onboarding", {
			signed: false,
		});
		await t.run((ctx) =>
			applyEvent(ctx, id, {
				type: "EXTEND_WINDOW",
				until: Date.now() + DAY,
			})
		);
		const row = await get(t, id);
		expect(row?.stage).toBe("onboarding");
		expect(row?.activatedAt).toBeUndefined();
	});

	it("stamps the old stageSince on a self-loop of an already-active row", async () => {
		const t = convexTest(schema, modules);
		const id = await insertPerson(t, "guest", "active", {
			signed: false,
			stageSince: 12_345,
		});
		await t.run((ctx) =>
			applyEvent(ctx, id, {
				type: "EXTEND_WINDOW",
				until: Date.now() + DAY,
			})
		);
		const row = await get(t, id);
		expect(row?.stageSince).toBe(12_345);
		expect(row?.activatedAt).toBe(12_345);
	});

	it("does not count leaving mid-onboarding: RE_ADMIT goes back to onboarding", async () => {
		const t = convexTest(schema, modules);
		const id = await insertPerson(t, "member", "onboarding", {
			signed: true,
		});
		await t.run((ctx) => applyEvent(ctx, id, { type: "KICK_OUT" }));
		const former = await get(t, id);
		expect(former?.tier).toBe("former");
		expect(former?.activatedAt).toBeUndefined();
		await t.run((ctx) => applyEvent(ctx, id, { type: "RE_ADMIT" }));
		const row = await get(t, id);
		expect(`${row?.tier}.${row?.stage}`).toBe("member.onboarding");
		expect(row?.activatedAt).toBeUndefined();
	});
});

describe("agreement re-opened on a tier move", () => {
	it("makes a guest set to member sign again instead of finishing with nothing to do", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "Guest",
				tier: "guest",
				stage: "active",
				stageSince: 1,
				activatedAt: 1,
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId: pid,
				email: "g@example.com",
				variant: "guest",
				signedName: "G Guest",
				agreementVersion: "test",
				agreementHash: "",
				signedAt: 1,
			});
			return pid;
		});
		await t.run((ctx) =>
			applyEvent(ctx, id, { type: "SET_ROLE", tier: "member" })
		);
		const row = await t.run((ctx) => ctx.db.get(id));
		expect(`${row?.tier}.${row?.stage}`).toBe("member.onboarding");
		expect(Object.keys(row?.onboarding?.steps ?? {}).sort()).toEqual([
			"rules",
			"visit",
			"welcome",
		]);
	});

	it("makes an expired guest who re-applies and is approved as a member sign the member agreement", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "g@example.com",
				firstName: "G",
				lastName: "Guest",
				tier: "guest",
				stage: "expired",
				stageSince: 1,
				activatedAt: 1,
				verifiedAt: 1,
				accessFrom: 1,
				accessUntil: 2,
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId: pid,
				email: "g@example.com",
				variant: "guest",
				signedName: "G Guest",
				agreementVersion: "test",
				agreementHash: "",
				signedAt: 1,
			});
			return pid;
		});
		for (const event of [
			{ type: "REAPPLY" },
			{ type: "VERIFY_EMAIL" },
			{ type: "APPROVE_MEMBER" },
		] as const)
			await t.run((ctx) => applyEvent(ctx, id, event));

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(`${row?.tier}.${row?.stage}`).toBe("member.onboarding");
		expect(Object.keys(row?.onboarding?.steps ?? {}).sort()).toEqual([
			"rules",
			"visit",
			"welcome",
		]);
		// The guest's closed window would deny the wizard and the door.
		expect(row?.accessUntil).toBeUndefined();
		expect(row && entitled(row, Date.now())).toBe(true);
	});

	it("approves a re-applicant who already signed the member agreement straight into active", async () => {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const pid = await ctx.db.insert("people", {
				email: "m@example.com",
				firstName: "M",
				lastName: "Member",
				tier: "former",
				stage: "active",
				stageSince: 1,
				formerOf: "guest",
				verifiedAt: 1,
				accessUntil: 2,
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						rules: { completedAt: 1 },
						visit: { completedAt: 1 },
					},
				},
			});
			await ctx.db.insert("signatures", {
				personId: pid,
				email: "m@example.com",
				variant: "member",
				signedName: "M Member",
				agreementVersion: "test",
				agreementHash: "",
				signedAt: 1,
			});
			return pid;
		});
		for (const event of [
			{ type: "REAPPLY" },
			{ type: "VERIFY_EMAIL" },
			{ type: "APPROVE_MEMBER" },
		] as const)
			await t.run((ctx) => applyEvent(ctx, id, event));

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(`${row?.tier}.${row?.stage}`).toBe("member.active");
		expect(row?.activatedAt).toBeTypeOf("number");
		expect(row?.onboarding?.steps.document).toBeDefined();
		expect(row?.accessUntil).toBeUndefined();
		expect(row && entitled(row, Date.now())).toBe(true);
	});

	it.each(["member", "board"] as const)(
		"drops a closed guest window when an expired guest is made %s",
		async (tier) => {
			const t = convexTest(schema, modules);
			const id = await t.run(async (ctx) =>
				ctx.db.insert("people", {
					email: "g@example.com",
					firstName: "G",
					lastName: "Guest",
					tier: "guest",
					stage: "expired",
					stageSince: 1,
					activatedAt: 1,
					accessFrom: 1,
					accessUntil: 2,
					accessUntilLocal:
						"1970-01-01T01:00:00+01:00[Europe/Zurich]",
				})
			);
			await t.run((ctx) =>
				applyEvent(ctx, id, { type: "SET_ROLE", tier })
			);

			const row = await t.run((ctx) => ctx.db.get(id));
			expect(row?.tier).toBe(tier);
			expect(row?.accessFrom).toBeUndefined();
			expect(row?.accessUntil).toBeUndefined();
			expect(row?.accessUntilLocal).toBeUndefined();
			expect(row && entitled(row, Date.now())).toBe(true);
		}
	);

	it("approves a fresh applicant into onboarding as before", async () => {
		const { t, asBoard, boardId } = await setup();
		const id = await insertProspect(t, "verified");
		const until = Date.now() + 30 * DAY;

		await asBoard.mutation(api.lifecycle.transition, {
			personId: id,
			event: { type: "APPROVE_GUEST", until, hostedById: boardId },
		});

		const row = await t.run((ctx) => ctx.db.get(id));
		expect(`${row?.tier}.${row?.stage}`).toBe("guest.onboarding");
		expect(row?.accessUntil).toBe(until);
		expect(row?.hostedById).toBe(boardId);
		// Nothing is ticked, so there is no step to re-open and no record to write.
		expect(row?.onboarding).toBeUndefined();
		const jobs = await scheduledJobs(t);
		expect(jobs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "notifications:sendApprovalEmail",
				}),
			])
		);
	});
});
