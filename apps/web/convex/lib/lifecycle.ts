import type { Doc } from "../_generated/dataModel";

import { compliance, windowOpen } from "./derive.ts";
import {
	IllegalTransitionError,
	type Effect,
	type EventType,
	type Facts,
	type LifecycleEvent,
	type StateId,
	type Tier,
} from "./lifecycleTypes.ts";
import {
	firstIncompleteSelfStepId,
	type OnboardingStepId,
} from "./onboardingSteps.ts";
import { isBoardLevel, isCommunityTier } from "./roles.ts";

export type Rule = {
	/** Target state, or a function of the event + facts for dynamic targets. */
	to: StateId | ((event: LifecycleEvent, facts: Facts) => StateId);
	/** Pure predicate over pre-loaded facts. A false guard means "illegal". */
	guard?: (facts: Facts, event: LifecycleEvent) => boolean;
	effects?: (event: LifecycleEvent, facts: Facts) => Effect[];
};

/** Active needs the right agreement, and either the onboarding steps or a
 *  past activation (legacy imports never did the steps). */
export function canActivate(facts: Facts): boolean {
	return facts.complianceMet && (facts.selfStepsComplete || facts.everActive);
}

/**
 * The guard facts for one row, with compliance and the step list read against
 * `targetTier` (see `loadFacts` for why an event may retarget them). Pure, so
 * the machine and the invariant check cannot compute them differently.
 */
export function factsFor(
	person: Doc<"people">,
	signatureVariants: string[],
	targetTier: Tier,
	now: number
): Facts {
	return {
		verified: person.verifiedAt != null,
		complianceMet:
			compliance({ ...person, tier: targetTier }, signatureVariants) ===
			"met",
		selfStepsComplete:
			firstIncompleteSelfStepId(
				targetTier,
				person.onboarding?.steps ?? {}
			) === null,
		everActive: person.activatedAt != null,
		windowOpen: windowOpen(person, now),
		formerOf: person.formerOf,
	};
}

/**
 * Landing in onboarding for want of the target tier's agreement re-opens the
 * document step. Without it, someone who ticked that step under another
 * agreement (a guest made a member, a board member demoted, an expired guest
 * re-applying and approved as a member) has every step
 * done and nothing left to sign: the "Almost there" dead end.
 */
function agreementEffects(facts: Facts): Effect[] {
	return facts.complianceMet
		? []
		: [{ type: "RESET_STEP", step: "document" }];
}

/** `onboarding` with one self step un-ticked; everything else is kept. */
export function onboardingWithoutStep(
	onboarding: Doc<"people">["onboarding"],
	step: OnboardingStepId
): NonNullable<Doc<"people">["onboarding"]> {
	const steps = Object.fromEntries(
		Object.entries(onboarding?.steps ?? {}).filter(([id]) => id !== step)
	);
	return { ...(onboarding ?? { steps: {} }), steps };
}

/** The machine state a row is in. */
export function stateOf(
	person: Pick<Doc<"people">, "tier" | "stage">
): StateId {
	return `${person.tier}.${person.stage}`;
}

/** An `active` state of a membership tier. `former.active` is not one:
 *  leaving is not activating. Nor is `staff.active`: staff never onboard, so
 *  counting it would let a staff person made a member skip the steps. */
export function isMembershipActive(state: StateId): boolean {
	const [tier, stage] = state.split(".");
	return stage === "active" && isCommunityTier(tier);
}

function windowEffects(event: LifecycleEvent): Effect[] {
	const { until } = event as Extract<
		LifecycleEvent,
		{ type: "APPROVE_GUEST" | "EXTEND_WINDOW" }
	>;
	return [
		{ type: "SET_WINDOW", until },
		// No date means the window never closes, so there is nothing to schedule.
		// Scheduling `runAt(undefined)` would be an error, and scheduling for
		// `now` would expire the guest the instant they were approved.
		...(until === undefined
			? []
			: [{ type: "SCHEDULE_WINDOW_EXPIRY" as const, at: until }]),
		{ type: "RECONCILE_DOOR" },
	];
}

const LEAVE: Partial<Record<EventType, Rule>> = {
	KICK_OUT: {
		to: "former.active",
		effects: () => [
			{ type: "SET_FORMER", reason: "kicked" },
			{ type: "RECONCILE_DOOR" },
		],
	},
	MARK_LEFT: {
		to: "former.active",
		effects: () => [
			{ type: "SET_FORMER", reason: "left" },
			{ type: "RECONCILE_DOOR" },
		],
	},
};

/**
 * The stage a move into `tier` lands in, by the activation guard over the
 * facts (`loadFacts` says which events read them against the target tier).
 * It only picks the state: someone new has no agreement and no steps, so
 * lands in onboarding; someone coming back with the tier's agreement on file
 * and their steps (or a past activation) goes straight to active. Re-opening
 * the document step when the agreement is missing is `agreementEffects`' job.
 *
 * `board`, `admin` and `staff` always land in `.active`: `agreementVariantFor`
 * returns null for all three and `requiredSelfStepIds` returns `[]`, so the
 * guard is vacuous there, and `.onboarding` would be a state they could never
 * leave, because `ONBOARDING_PROGRESSED` is not an edge from board, admin or
 * staff.
 */
function activeIfReady(
	tier: NonNullable<Facts["formerOf"]>
): (event: LifecycleEvent, facts: Facts) => StateId {
	if (isBoardLevel(tier) || tier === "staff") return () => `${tier}.active`;
	return (_e, f) =>
		canActivate(f) ? `${tier}.active` : `${tier}.onboarding`;
}

/**
 * A window is a guest's grant. Leaving the guest tier for another drops it:
 * `entitled` checks the window for every tier, so a kept end date would lock
 * out a member or board member once it passed. Leaving for `former` needs no
 * wrapper, `SET_FORMER` already clears it.
 */
function droppingWindow(rule: Rule): Rule {
	return {
		...rule,
		effects: (e, f) => [
			...(rule.effects?.(e, f) ?? []),
			{ type: "CLEAR_WINDOW" },
		],
	};
}

/**
 * Every role move, in both directions, legal from every state: `people.addDirect`
 * and the Notion import both need it, neither may patch a role field directly
 * (D3), and without a downward edge `board.active` has no non-destructive exit
 * at all — a mis-set role would be repairable only by kicking the person out.
 *
 * The target stage is NOT unconditionally `.active`. `board`, `admin` and
 * `staff` land in `.active` (see `activeIfReady`); `member` and `core` go
 * through `canActivate`, the same guard `RE_ADMIT` uses.
 *
 * A board member has never needed an agreement — board tier has no variant — so
 * demoting one straight to `member.active` would put a member with no agreement
 * on file back in the roster, which is precisely the observed failure this spec
 * exists to kill. `loadFacts` computes `complianceMet` and `selfStepsComplete`
 * against the event's TARGET tier for exactly this reason.
 */
const SET_ROLE: Rule = {
	to: (event, facts) => {
		const { tier } = event as Extract<LifecycleEvent, { type: "SET_ROLE" }>;
		return activeIfReady(tier)(event, facts);
	},
	effects: (_e, f) => [...agreementEffects(f), { type: "RECONCILE_DOOR" }],
};

/** A role move out of a guest state also drops the guest window. */
const SET_ROLE_FROM_GUEST = droppingWindow(SET_ROLE);

/**
 * Onboarding/active shared rules for a tier that can hold members.
 * `ONBOARDING_PROGRESSED` is the one transition that turns access ON — it must
 * reconcile the door, unlike states where access does not change.
 */
function tierRules(
	tier: "guest" | "member" | "core"
): Partial<Record<EventType, Rule>> {
	return {
		ONBOARDING_PROGRESSED: {
			to: `${tier}.active`,
			guard: canActivate,
			effects: () => [{ type: "RECONCILE_DOOR" }],
		},
		...LEAVE,
		SET_ROLE: tier === "guest" ? SET_ROLE_FROM_GUEST : SET_ROLE,
	};
}

const APPROVE: Partial<Record<EventType, Rule>> = {
	APPROVE_GUEST: {
		to: activeIfReady("guest"),
		guard: (f) => f.verified,
		effects: (e, f) => {
			const { hostedById } = e as Extract<
				LifecycleEvent,
				{ type: "APPROVE_GUEST" }
			>;
			const hostEffects: Effect[] =
				hostedById === undefined
					? []
					: [{ type: "SET_HOST", hostedById }];
			return [
				...agreementEffects(f),
				...windowEffects(e),
				{ type: "EMAIL", template: "approval" },
				...hostEffects,
			];
		},
	},
	// A member holds no guest window, and a prospect may still carry one
	// (seeded or imported rows). Not `droppingWindow`: this edge leaves the
	// prospect tier, not the guest tier.
	APPROVE_MEMBER: {
		to: activeIfReady("member"),
		guard: (f) => f.verified,
		effects: (_e, f) => [
			...agreementEffects(f),
			{ type: "EMAIL", template: "approval" },
			{ type: "RECONCILE_DOOR" },
			{ type: "CLEAR_WINDOW" },
		],
	},
	DENY: {
		to: "prospect.denied",
		effects: () => [
			{ type: "SET_DENIED_AT" },
			{ type: "EMAIL", template: "rejection" },
		],
	},
};

const PROMOTE_TO_MEMBER: Rule = droppingWindow({
	to: "member.onboarding",
	effects: () => [
		{ type: "RESET_STEP", step: "document" },
		{ type: "EMAIL", template: "memberUpgrade" },
	],
});

const PROMOTE_TO_BOARD: Rule = {
	to: "board.active",
	effects: () => [{ type: "RECONCILE_DOOR" }],
};

const REAPPLY: Rule = {
	to: "prospect.unverified",
	effects: () => [{ type: "RESET_SCORE" }, { type: "RECONCILE_DOOR" }],
};

// Door-less REAPPLY: same self-serve reset as prospect.unverified, no
// RECONCILE_DOOR because these states hold no keys. Shared by three states.
const REAPPLY_NO_DOOR: Rule = {
	to: "prospect.unverified",
	effects: () => [{ type: "RESET_SCORE" }],
};

const EXPIRE: Rule = {
	to: "guest.expired",
	guard: (f) => !f.windowOpen,
	effects: () => [{ type: "RECONCILE_DOOR" }],
};

/**
 * The machine. Typed `Partial<Record<StateId, Partial<Record<EventType, Rule>>>>`
 * — NOT `Record<string, Record<string, Rule>>`.
 *
 * eslint resolves `convex/**` against `convex/tsconfig.json`, which is strict but
 * has `noUncheckedIndexedAccess` off. Under a total `Record<string, …>` index
 * signature `TABLE[from]` is non-nullish, so `reduce`'s `TABLE[from]?.[…]` and
 * `if (!rule)` both raise `@typescript-eslint/no-unnecessary-condition`, and both
 * packages lint at `--max-warnings 0`. The `Partial` makes the lookups genuinely
 * possibly-undefined, which is the truth anyway.
 */
export const TABLE: Partial<Record<StateId, Partial<Record<EventType, Rule>>>> =
	{
		"prospect.unverified": {
			VERIFY_EMAIL: {
				to: "prospect.verified",
				effects: () => [
					{ type: "EMAIL", template: "applicationReceived" },
					{ type: "NOTIFY_BOARD" },
				],
			},
			// The edit-before-confirm path: a second submission for an email that is
			// still unverified reuses the row rather than duplicating it.
			REAPPLY: REAPPLY_NO_DOOR,
			// DELIBERATELY no DENY here, though the spec's "Prospect.* -> Prospect.Denied"
			// reads as if there should be. An unverified prospect is invisible to the
			// board (`applications.list` filters on `verifiedAt != null`), so nobody
			// can deny one, and the purge cron deletes them at token expiry. Adding the
			// edge would create a `prospect.denied` row nobody asked for and a
			// `deniedAt` that blocks a genuine re-application for six months.
			IMPORT: {
				to: (event) => {
					const { tier, hasSignature } = event as Extract<
						LifecycleEvent,
						{ type: "IMPORT" }
					>;
					return hasSignature
						? `${tier}.active`
						: `${tier}.onboarding`;
				},
				// An imported member/guest is entitled the moment they land, so the
				// lock has to be told. Without this the door only opens after the
				// nightly reconciler — an imported person cannot get in on day one.
				effects: () => [{ type: "RECONCILE_DOOR" }],
			},
			SET_ROLE,
		},
		"prospect.verified": {
			SET_SCORE: { to: "prospect.queued" },
			...APPROVE,
			SET_ROLE,
		},
		"prospect.queued": {
			SET_SCORE: { to: "prospect.queued" },
			...APPROVE,
			SET_ROLE,
		},
		"prospect.denied": {
			REAPPLY,
			UNDENY: {
				to: "prospect.queued",
				effects: () => [{ type: "CLEAR_DENIED_AT" }],
			},
			SET_ROLE,
		},
		"guest.onboarding": {
			...tierRules("guest"),
			PROMOTE_TO_MEMBER,
			EXTEND_WINDOW: { to: "guest.onboarding", effects: windowEffects },
			WINDOW_EXPIRED: EXPIRE,
		},
		"guest.active": {
			...tierRules("guest"),
			PROMOTE_TO_MEMBER,
			EXTEND_WINDOW: { to: "guest.active", effects: windowEffects },
			WINDOW_EXPIRED: EXPIRE,
		},
		"guest.expired": {
			...LEAVE,
			SET_ROLE: SET_ROLE_FROM_GUEST,
			PROMOTE_TO_MEMBER,
			// A guest who expired while still in `guest.onboarding` — agreement
			// unsigned, steps incomplete — must not be waved straight into
			// `guest.active`; the target follows the same `canActivate` policy as
			// `SET_ROLE` and `RE_ADMIT`.
			EXTEND_WINDOW: {
				to: activeIfReady("guest"),
				effects: (e, f) => [
					...agreementEffects(f),
					...windowEffects(e),
				],
			},
			REAPPLY: droppingWindow(REAPPLY),
		},
		"member.onboarding": tierRules("member"),
		"member.active": {
			...tierRules("member"),
			// Same compliance policy as SET_ROLE{core} and RE_ADMIT{formerOf:"core"}:
			// a member with no core-variant agreement on file must not land in
			// `core.active` unconditionally. Door differs between member and core,
			// so it must be reconciled either way.
			GRANT_CORE: {
				to: activeIfReady("core"),
				effects: (_e, f) => [
					...agreementEffects(f),
					{ type: "RECONCILE_DOOR" },
				],
			},
			PROMOTE_TO_BOARD,
		},
		"core.onboarding": tierRules("core"),
		"core.active": {
			...tierRules("core"),
			REVOKE_CORE: {
				to: activeIfReady("member"),
				effects: (_e, f) => [
					...agreementEffects(f),
					{ type: "RECONCILE_DOOR" },
				],
			},
			PROMOTE_TO_BOARD,
		},
		// SET_ROLE is the non-destructive exit from both: it carries the target
		// tier, so board -> member, board -> admin, admin -> core and so on all
		// travel this one edge. Without it the only way out of board.active is
		// KICK_OUT or MARK_LEFT, i.e. you cannot correct a mis-set role without
		// archiving the person first.
		"board.active": { ...LEAVE, SET_ROLE },
		"admin.active": { ...LEAVE, SET_ROLE },
		"staff.active": { ...LEAVE, SET_ROLE },
		"former.active": {
			RE_ADMIT: {
				to: (event, facts) =>
					activeIfReady(facts.formerOf ?? "member")(event, facts),
				effects: (_e, f) => [
					...agreementEffects(f),
					{ type: "RECONCILE_DOOR" },
				],
			},
			REAPPLY,
			SET_ROLE,
		},
		// Visitor confirm is a field patch, not VERIFY_EMAIL — that event emails
		// the board, and a Wi-Fi sign-up is not an application. REAPPLY is the
		// only machine edge: same RESET_SCORE self-serve as prospect.unverified,
		// without RECONCILE_DOOR (visitors hold no keys).
		"visitor.unverified": {
			REAPPLY: REAPPLY_NO_DOOR,
		},
		"visitor.verified": {
			REAPPLY: REAPPLY_NO_DOOR,
		},
	};

export const ALL_STATES: StateId[] = [
	"prospect.unverified",
	"prospect.verified",
	"prospect.queued",
	"prospect.denied",
	"guest.onboarding",
	"guest.active",
	"guest.expired",
	"member.onboarding",
	"member.active",
	"core.onboarding",
	"core.active",
	"board.active",
	"admin.active",
	"staff.active",
	"former.active",
	"visitor.unverified",
	"visitor.verified",
];

/**
 * Compile-time proof that `ALL_EVENTS` lists every `EventType`. The second
 * intersection member resolves to `never` — making the call itself a type
 * error — as soon as an event exists in the union but not in the array.
 */
function allEvents<const T extends readonly EventType[]>(
	events: T & (Exclude<EventType, T[number]> extends never ? unknown : never)
): T {
	return events;
}

export const ALL_EVENTS = allEvents([
	"VERIFY_EMAIL",
	"SET_SCORE",
	"APPROVE_GUEST",
	"APPROVE_MEMBER",
	"DENY",
	"UNDENY",
	"ONBOARDING_PROGRESSED",
	"PROMOTE_TO_MEMBER",
	"PROMOTE_TO_BOARD",
	"SET_ROLE",
	"IMPORT",
	"GRANT_CORE",
	"REVOKE_CORE",
	"EXTEND_WINDOW",
	"WINDOW_EXPIRED",
	"KICK_OUT",
	"MARK_LEFT",
	"RE_ADMIT",
	"REAPPLY",
]);

const STATE_IDS: ReadonlySet<string> = new Set<string>(ALL_STATES);

/** Whether a stored string (an audit row's `to`, say) names a machine state. */
export function isStateId(state: string): state is StateId {
	return STATE_IDS.has(state);
}

/**
 * Every event legal from a state, straight out of `TABLE`. The board console
 * builds its "change role" menu from this so the offered moves cannot drift
 * from the machine — a guard may still reject one at dispatch time.
 */
export function legalEvents(from: StateId): EventType[] {
	return Object.keys(TABLE[from] ?? {}) as EventType[];
}

export function reduce(
	from: StateId,
	event: LifecycleEvent,
	facts: Facts
): { next: StateId; effects: Effect[] } {
	const rule = TABLE[from]?.[event.type];
	if (!rule) throw new IllegalTransitionError(from, event.type);
	if (rule.guard && !rule.guard(facts, event)) {
		throw new IllegalTransitionError(from, event.type);
	}
	const next =
		typeof rule.to === "function" ? rule.to(event, facts) : rule.to;
	return { next, effects: rule.effects?.(event, facts) ?? [] };
}
