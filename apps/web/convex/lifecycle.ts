// apps/web/convex/lifecycle.ts
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	mutation,
	type MutationCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { isLiveStage } from "./lib/derive.ts";
import { personByEmail } from "./lib/emailAddress.ts";
import {
	factsFor,
	isMembershipActive,
	onboardingWithoutStep,
	reduce,
	stateOf,
} from "./lib/lifecycle.ts";
import {
	IllegalTransitionError,
	type Effect,
	type Facts,
	type LifecycleEvent,
	type StateId,
	type Tier,
} from "./lib/lifecycleTypes.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_LEVEL, formerOfTier, ROLE_TIERS } from "./lib/roles.ts";
import { SITE_TIMEZONE, zonedLocalFromEpoch } from "./lib/time.ts";
import {
	notifyGuestAccessChanged,
	notifyGuestExpired,
	notifyGuestWindowChanged,
	scheduleGuestExpiringSoon,
} from "./notify/guests.ts";
import { notify } from "./notify/notify.ts";

/** The tier `loadFacts` reads compliance and steps against (see there). */
function targetTier(person: Doc<"people">, event: LifecycleEvent): Tier {
	switch (event.type) {
		case "SET_ROLE":
			return event.tier;
		case "APPROVE_GUEST":
			return "guest";
		case "APPROVE_MEMBER":
			return "member";
		default:
			return person.tier === "former"
				? (person.formerOf ?? "member")
				: person.tier;
	}
}

/**
 * Everything guards may read. Loaded once, before the reducer runs.
 *
 * `selfStepsComplete` is keyed off TIER, not the legacy person type: keying it
 * off `type` returned an empty required-step list for applicants and core
 * members, so `selfStepsComplete` was vacuously true and anyone could activate
 * with zero steps done.
 *
 * `targetTier` is why `RE_ADMIT`, `SET_ROLE` and the two approvals work. Facts
 * are computed from the PRE-transition row, but these events move a person into
 * a tier they are not in yet, and ALL resolve their stage through `canActivate`.
 * Evaluating the guard against the tier they are leaving makes it vacuously true
 * in each case, which is the same bug three times:
 *
 * - `RE_ADMIT` from `former.active`: `agreementVariantFor("former")` is null (so
 *   `compliance` is "met") and `requiredSelfStepIds("former")` is `[]` (so
 *   `.every()` on an empty array is true). The `onboarding` branch becomes dead
 *   code and every re-admitted person lands in `${tier}.active`.
 * - `SET_ROLE` demoting a board member: `agreementVariantFor("board")` is null
 *   too — board tier never needed an agreement — so a board member who has
 *   never signed one would demote straight into `member.active`.
 * - `APPROVE_GUEST` / `APPROVE_MEMBER` from a prospect state: the prospect tier
 *   has no variant either. A re-applicant (an expired guest, a former member)
 *   keeps the steps they ticked, so approval into the other tier landed them in
 *   onboarding with every step done and the new agreement unsigned: the
 *   "Almost there" dead end.
 *
 * All end at "no agreement on file and nothing left to ask", one of the exact
 * observed failures this spec exists to kill. So compliance and the step list
 * are evaluated against the tier the event moves them INTO.
 *
 * THREE MORE rules now resolve through `canActivate` — `GRANT_CORE`,
 * `REVOKE_CORE` and `EXTEND_WINDOW` when it leaves `guest.expired` — and none of
 * them needs a `target` arm here. That is not an oversight, it is arithmetic:
 * `agreementVariantFor` maps member and core to the SAME "member" variant, and
 * `requiredSelfStepIds` returns the same list for guest, member and core. So
 * evaluating member↔core against either tier gives an identical answer, and the
 * expired guest is still a guest. Adding arms for them would be dead code that
 * looks load-bearing. If a future tier ever gets its own agreement variant or
 * its own step list, that stops being true and this comment becomes the bug
 * report.
 *
 * `windowOpen` is deliberately NOT re-targeted: it is a property of the row's
 * own access window, and no event changes which window applies.
 */
export async function loadFacts(
	ctx: MutationCtx,
	person: Doc<"people">,
	event: LifecycleEvent
): Promise<Facts> {
	const signatures = await ctx.db
		.query("signatures")
		.withIndex("by_person", (q) => q.eq("personId", person._id))
		.collect();
	return factsFor(
		person,
		signatures.map((s) => s.variant),
		targetTier(person, event),
		Date.now()
	);
}

/**
 * Execute one declarative effect. Every database and scheduler write lives here.
 *
 * `person` is the PRE-PATCH document. That matters: `SET_FORMER` has to read the
 * tier the person is leaving, and every other effect either uses only `_id` or
 * reads a field (`onboarding`, `board`, `email`) that the tier/stage patch does
 * not touch. Handing effects the post-patch row is what made `SET_FORMER` store
 * `formerOf: undefined` for everyone.
 *
 * Every effect also reads that SAME pre-patch `person` — none of them re-fetch
 * between calls. That is fine today because no rule's effect list writes the
 * same field twice, but it does not compose: two effects in one rule that both
 * patch the same field would have the second clobber the first rather than
 * building on it (each one's patch is computed from the field's ORIGINAL
 * value, not whatever the previous effect in the same `effects` array just
 * wrote). Keep that in mind before adding a rule with two effects on one
 * field.
 */
async function runEffect(
	ctx: MutationCtx,
	person: Doc<"people">,
	effect: Effect,
	event: LifecycleEvent
): Promise<void> {
	switch (effect.type) {
		case "EMAIL": {
			// Every lifecycle email is auditable: one row per send, kind "email",
			// with the template in `meta`.
			await ctx.db.insert("personEvents", {
				personId: person._id,
				at: Date.now(),
				kind: "email",
				meta: effect.template,
			});
			switch (effect.template) {
				case "rejection":
					await ctx.scheduler.runAfter(
						0,
						internal.notifications.sendRejectionEmail,
						{
							email: person.email,
							name: person.firstName,
							venture: person.venture?.name ?? "your venture",
						}
					);
					return;
				case "memberUpgrade":
					await ctx.scheduler.runAfter(
						0,
						internal.notifications.sendMemberUpgradeEmail,
						{ email: person.email }
					);
					return;
				case "applicationReceived":
					await ctx.scheduler.runAfter(
						0,
						internal.notifications.sendApplicationReceivedEmail,
						{ email: person.email }
					);
					return;
				case "approval":
					await ctx.scheduler.runAfter(
						0,
						internal.notifications.sendApprovalEmail,
						{
							email: person.email,
						}
					);
					return;
			}
			break; // exhaustive above; only here to satisfy no-fallthrough
		}
		case "NOTIFY_BOARD":
			await notify(ctx, "newApplication", {
				personId: person._id,
				applicantName: displayName(person),
				venture: person.venture?.name ?? "—",
			});
			return;
		case "RESET_STEP":
			// Nothing to reset: a fresh applicant keeps having no onboarding record.
			if (!person.onboarding || !(effect.step in person.onboarding.steps))
				return;
			await ctx.db.patch(person._id, {
				onboarding: onboardingWithoutStep(
					person.onboarding,
					effect.step
				),
			});
			return;
		case "SET_WINDOW":
			await ctx.db.patch(person._id, {
				// Only STAMP the start when there isn't one. `EXTEND_WINDOW` reuses
				// this effect; re-stamping `accessFrom` on every extension rewrites
				// the window start and, with it, the "from" date in the guest
				// approval email and the Guests tab's "joined" column.
				accessFrom: person.accessFrom ?? Date.now(),
				// `undefined` here is an OPEN-ENDED grant, and Convex reads it as
				// "remove the field" — which is exactly right: `windowOpen` treats a
				// missing `accessUntil` as a window that never closes, and
				// `sendApprovalEmail` switches to its windowless variant.
				accessUntil: effect.until,
				// Model B source-of-truth: the wall-clock+zone the epoch represents,
				// so a future IANA rule change can be recomputed. undefined =
				// open-ended grant.
				accessUntilLocal:
					effect.until == null
						? undefined
						: zonedLocalFromEpoch(effect.until, SITE_TIMEZONE),
			});
			return;
		case "CLEAR_WINDOW":
			await ctx.db.patch(person._id, {
				accessFrom: undefined,
				accessUntil: undefined,
				accessUntilLocal: undefined,
			});
			return;
		case "SET_HOST":
			await ctx.db.patch(person._id, { hostedById: effect.hostedById });
			return;
		case "SCHEDULE_WINDOW_EXPIRY":
			await ctx.scheduler.runAt(
				effect.at,
				internal.lifecycle.windowExpired,
				{
					personId: person._id,
				}
			);
			await scheduleGuestExpiringSoon(
				ctx,
				person._id,
				effect.at,
				person.accessUntil
			);
			return;
		// `revokeUnlessBreakGlass` returns a discriminated
		// `RevokeUnlessBreakGlassResult` and REJECTS on a door-provider error.
		// Scheduling discards both: the promise here
		// resolves once the job is queued, so there is nothing to read and
		// nothing to catch — it must not fail the transition that caused it.
		// There is no nightly sweep behind it any more: a failed revoke shows
		// as a failed scheduled run in the dashboard and is re-run by hand
		// (README, door access section). A grant needs nothing — the app opens
		// the door off `access()` directly.
		case "RECONCILE_DOOR":
			await ctx.scheduler.runAfter(
				0,
				internal.doorRevoke.revokeUnlessBreakGlass,
				{
					personId: person._id,
					trigger: "lifecycle",
					detail: event.type,
				}
			);
			return;
		case "SET_DENIED_AT":
			await ctx.db.patch(person._id, { deniedAt: Date.now() });
			return;
		case "CLEAR_DENIED_AT":
			await ctx.db.patch(person._id, { deniedAt: undefined });
			return;
		case "RESET_SCORE":
			// Skip the patch entirely when there is no `board` object to clear —
			// a fresh prospect who was never scored has none, and patching one in
			// just to hold `{ score: undefined }` is dashboard noise with no
			// observable effect.
			if (person.board === undefined) return;
			await ctx.db.patch(person._id, {
				board: { ...person.board, score: undefined },
			});
			return;
		case "SET_FORMER": {
			await ctx.db.patch(person._id, {
				formerOf: formerOfTier(person.tier),
				formerReason: effect.reason,
				accessFrom: undefined,
				accessUntil: undefined,
				accessUntilLocal: undefined,
			});
			return;
		}
	}
}

/** Board member behind the current call, or undefined for system events. */
export async function currentActorId(
	ctx: MutationCtx
): Promise<Id<"people"> | undefined> {
	const identity = await ctx.auth.getUserIdentity();
	const email = identity?.email;
	if (!email) return undefined;
	const actor = await personByEmail(ctx, email);
	return actor?._id;
}

/**
 * The single write path for lifecycle state: load facts, reduce, patch, log,
 * run effects. Nothing else in the codebase may write `tier`/`stage`.
 *
 * `reduce` throws before the first write, so an illegal event leaves the row
 * and the audit log untouched.
 */
export async function applyEvent(
	ctx: MutationCtx,
	personId: Id<"people">,
	event: LifecycleEvent,
	actorId?: Id<"people">
): Promise<StateId> {
	const person = await ctx.db.get(personId);
	if (!person) throw new Error("Person not found");

	const from = stateOf(person);
	// The event goes in: two edges (RE_ADMIT, SET_ROLE) resolve their stage
	// against the tier they move INTO, not the one the row is in.
	const facts = await loadFacts(ctx, person, event);
	const { next, effects } = reduce(from, event, facts);

	const [tier, stage] = next.split(".") as [
		NonNullable<Doc<"people">["tier"]>,
		NonNullable<Doc<"people">["stage"]>,
	];
	// `stageSince` is re-stamped ONLY on a real state change. SET_SCORE
	// (prospect.queued -> prospect.queued), EXTEND_WINDOW and REAPPLY-from-
	// unverified are all self-loops, and `personStatus.since` ("in this state 23
	// days") is the spec's only stuck-person signal — a board re-score must not
	// reset it to zero.
	const now = Date.now();
	await ctx.db.patch(personId, {
		tier,
		stage,
		...(next === from ? {} : { stageSince: now }),
		// A row already active before the backfill keeps the time it got there.
		...(isMembershipActive(next) && person.activatedAt === undefined
			? {
					activatedAt: isMembershipActive(from)
						? person.stageSince
						: now,
				}
			: {}),
	});
	await ctx.db.insert("personEvents", {
		personId,
		at: Date.now(),
		actorId,
		kind: "transition",
		event: event.type,
		from,
		to: next,
	});

	for (const effect of effects) await runEffect(ctx, person, effect, event);
	// After the effects, so the notification reads the new window. These two
	// events are exactly what `setGuestAccess` and `upgradeGuestToMember` apply
	// (PROMOTE_TO_MEMBER is only legal from guest states).
	if (event.type === "EXTEND_WINDOW")
		await notifyGuestWindowChanged(ctx, personId, person.accessUntil);
	if (event.type === "PROMOTE_TO_MEMBER")
		await notifyGuestAccessChanged(ctx, personId, "upgraded");
	return next;
}

/**
 * `applyEvent` for callers where "not legal right now" is an ordinary outcome:
 * a scheduled window expiry whose window was extended, or an onboarding step
 * that is not the last one. Returns null instead of throwing. Any other error
 * still propagates.
 */
export async function applyEventIfLegal(
	ctx: MutationCtx,
	personId: Id<"people">,
	event: LifecycleEvent,
	actorId?: Id<"people">
): Promise<StateId | null> {
	try {
		return await applyEvent(ctx, personId, event, actorId);
	} catch (error) {
		if (error instanceof IllegalTransitionError) return null;
		throw error;
	}
}

/**
 * Append a field-edit row to the audit log. Scalars only — every caller passes
 * a string, number or undefined, and the existing editors commit on blur, so
 * this is one row per deliberate edit rather than one per keystroke.
 */
export async function logFieldEdit(
	ctx: MutationCtx,
	personId: Id<"people">,
	field: string,
	before: unknown,
	after: unknown,
	actorId?: Id<"people">
): Promise<void> {
	if (before === after) return;
	await ctx.db.insert("personEvents", {
		personId,
		at: Date.now(),
		actorId,
		kind: "field_edit",
		field,
		before,
		after,
	});
}

/** The tiers `SET_ROLE` can target; `people.addDirect` takes the same set. */
export const roleTier = v.union(...ROLE_TIERS.map((tier) => v.literal(tier)));

// IMPORT is deliberately absent: it is an internal edge for the Notion
// importer, reached through `applyEvent`, never over the wire.
const lifecycleEvent = v.union(
	v.object({ type: v.literal("VERIFY_EMAIL") }),
	v.object({ type: v.literal("SET_SCORE") }),
	v.object({
		type: v.literal("APPROVE_GUEST"),
		// Optional: an open-ended guest has no end date. See the note on the
		// event in `lib/lifecycleTypes.ts`.
		until: v.optional(v.number()),
		hostedById: v.optional(v.id("people")),
	}),
	v.object({ type: v.literal("APPROVE_MEMBER") }),
	v.object({ type: v.literal("DENY") }),
	v.object({ type: v.literal("UNDENY") }),
	v.object({ type: v.literal("ONBOARDING_PROGRESSED") }),
	v.object({ type: v.literal("PROMOTE_TO_MEMBER") }),
	v.object({ type: v.literal("PROMOTE_TO_BOARD") }),
	// Every role move, both directions. `member` and `core` are targets too:
	// demoting a board member is a legitimate board act and there is no other
	// non-destructive way out of board.active.
	v.object({ type: v.literal("SET_ROLE"), tier: roleTier }),
	v.object({ type: v.literal("GRANT_CORE") }),
	v.object({ type: v.literal("REVOKE_CORE") }),
	v.object({ type: v.literal("EXTEND_WINDOW"), until: v.number() }),
	v.object({ type: v.literal("WINDOW_EXPIRED") }),
	v.object({ type: v.literal("KICK_OUT") }),
	v.object({ type: v.literal("MARK_LEFT") }),
	v.object({ type: v.literal("RE_ADMIT") }),
	v.object({ type: v.literal("REAPPLY") })
);

export const transition = mutation({
	args: { personId: v.id("people"), event: lifecycleEvent },
	handler: async (ctx, { personId, event }) => {
		await requireRole(ctx, BOARD_LEVEL);
		return applyEvent(ctx, personId, event, await currentActorId(ctx));
	},
});

/**
 * Target of the SCHEDULE_WINDOW_EXPIRY effect, scheduled for the exact
 * `accessUntil` instant. Re-checks on fire: extending the window after
 * scheduling makes the stale job an ordinary no-op, because the machine's own
 * guard (`!windowOpen`) rejects it.
 */
export const windowExpired = internalMutation({
	args: { personId: v.id("people") },
	handler: async (ctx, { personId }) => {
		const next = await applyEventIfLegal(ctx, personId, {
			type: "WINDOW_EXPIRED",
		});
		if (next !== null) await notifyGuestExpired(ctx, personId);
		return null;
	},
});

export const SWEEP_BATCH = 100;

/**
 * Nightly backstop for windows that closed while the scheduler was down, or for
 * guests whose window was set before scheduled expiry existed. Registered as a
 * cron in Task 22. Walks the guest tier one page at a time and reschedules
 * itself with the next cursor, so a large cohort converges instead of
 * overrunning one transaction.
 */
export const sweepExpiredWindows = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }): Promise<{ expired: number }> => {
		const page = await ctx.db
			.query("people")
			.withIndex("by_tier", (q) => q.eq("tier", "guest"))
			.paginate({ numItems: SWEEP_BATCH, cursor: cursor ?? null });
		let expired = 0;
		for (const guest of page.page) {
			// Both stages the machine has a WINDOW_EXPIRED edge from: a guest
			// whose window closes before they finish onboarding must expire too,
			// or they sit in `guest.onboarding` with no way forward.
			if (!isLiveStage(guest.stage)) continue;
			const next = await applyEventIfLegal(ctx, guest._id, {
				type: "WINDOW_EXPIRED",
			});
			if (next !== null) {
				expired++;
				await notifyGuestExpired(ctx, guest._id);
			}
		}
		if (!page.isDone)
			await ctx.scheduler.runAfter(
				0,
				internal.lifecycle.sweepExpiredWindows,
				{ cursor: page.continueCursor }
			);
		return { expired };
	},
});
