import type { Stage, Tier } from "./lifecycleTypes.ts";
import { BOARD_STEPS, type BoardStepId } from "./onboardingSteps.ts";
import { isAccessTier, isBoardLevel } from "./roles.ts";

export type DoorOverride = "none" | "force_on" | "force_off";
/** Matches the design system's `TStatus` exactly, so a tone can be handed to
 *  `<Badge status={…}>` with no mapping table in between. */
export type Tone = "success" | "warning" | "error" | "info" | "neutral";

/** The machine's view of a person. Everything derived here reads only this. */
export type LifecyclePerson = {
	tier: Tier;
	stage: Stage;
	stageSince: number;
	accessFrom?: number;
	accessUntil?: number;
	/** The zoned IXDTF source for `accessUntil`, when present. Lets the status
	 *  readout show the guest's chosen end DAY in the site zone (not the
	 *  admin's browser zone), matching the editable picker. */
	accessUntilLocal?: string;
	door?: { override: DoorOverride; reason?: string };
	verifiedAt?: number;
	/**
	 * Why a `former` person is former. Written by `SET_FORMER` and never
	 * unwritten — `RE_ADMIT` and `REAPPLY` both leave a stale `"kicked"` sitting
	 * on the doc — so it is meaningless once `tier` has moved on. Every read
	 * below is gated on `tier === "former"`, which is why it belongs in here
	 * rather than being passed around raw: a caller that forgets the guard shows
	 * a re-admitted member a "Kicked out" badge forever, and that has happened.
	 */
	formerReason?: "kicked" | "left";
	onboarding?: {
		steps: Record<string, unknown>;
		boardSteps?: Record<string, unknown>;
	};
};

/** The two stages a person can be in while their access window is running:
 *  still onboarding, or active. */
export function isLiveStage(stage: Stage): boolean {
	return stage === "onboarding" || stage === "active";
}

/** Which agreement variant a tier requires; null = no agreement needed. */
export function agreementVariantFor(tier: Tier): "guest" | "member" | null {
	if (tier === "guest") return "guest";
	if (tier === "member" || tier === "core") return "member";
	return null;
}

/**
 * Region B. `met` requires a signature whose variant matches the CURRENT tier,
 * so a tier change invalidates the agreement by definition — that is what makes
 * "promoted guest still holding a guest agreement" impossible to miss.
 */
export function compliance(
	person: LifecyclePerson,
	signatureVariants: string[]
): "met" | "outstanding" {
	const required = agreementVariantFor(person.tier);
	if (required === null) return "met";
	return signatureVariants.includes(required) ? "met" : "outstanding";
}

export function windowOpen(person: LifecyclePerson, now: number): boolean {
	if (person.accessFrom != null && person.accessFrom > now) return false;
	if (person.accessUntil != null && person.accessUntil <= now) return false;
	return true;
}

/** Door entitlement from the lifecycle alone, before any board override. */
export function entitled(person: LifecyclePerson, now: number): boolean {
	return (
		isAccessTier(person.tier) &&
		isLiveStage(person.stage) &&
		windowOpen(person, now)
	);
}

/** Region C. The board override wins in both directions, by design. */
export function access(
	person: LifecyclePerson,
	now: number
): "granted" | "denied" {
	const override = person.door?.override ?? "none";
	if (override === "force_on") return "granted";
	if (override === "force_off") return "denied";
	return entitled(person, now) ? "granted" : "denied";
}

/**
 * Whether the door opens for this person right now: their access is granted.
 * The one check behind every door gate — the server's door actions
 * (`doorInternal.doorActionContext`), the Space page's unlock card, the
 * "Getting in" intro, the break-glass rule below and the Insights "missing
 * agreement" count (`src/modules/community/insights/metrics.ts`) — so they
 * cannot drift.
 */
export function doorOpensFor(person: LifecyclePerson, now: number): boolean {
	return access(person, now) === "granted";
}

/**
 * Whether this person's own lock key is the board/admin break-glass fallback:
 * the only key left in place, for an internet or lock-provider outage. True
 * only for board/admin tier whose door access is granted right now — a demoted
 * board member and a board member the board has shut out both lose theirs.
 * Used by `doorRevoke.ts` (the per-person revoke) and `merge.ts`.
 */
export function keepsBreakGlassKey(
	person: LifecyclePerson,
	now: number
): boolean {
	return isBoardLevel(person.tier) && doorOpensFor(person, now);
}

/**
 * Something the board would want to know that NOTHING ELSE on screen says.
 *
 * The tab, the group header and the other columns already carry tier and stage,
 * so a flag that restates them is noise — "Member, active" beside a row already
 * filed under "Members" taught the reader to ignore the column. A flag is an
 * exception: a fully settled person has none, and an empty cell is the signal.
 *
 * These carry no wording. What a flag SAYS is a UI decision and lives in
 * `src/modules/community/status/copy.ts`; what a flag IS is a fact about the
 * lifecycle and lives here. Keeping the two apart means a copy change is a
 * frontend change, and means this module can be reasoned about without
 * deciding how anything reads.
 */
export type StatusFlag =
	| { id: "agreement_missing"; variant: "guest" | "member" }
	| { id: "board_task_pending"; step: BoardStepId }
	| { id: "door_suspended"; actorName?: string }
	| { id: "door_forced_open"; actorName?: string };

/**
 * One line of the drawer's Status section. Unlike {@link StatusFlag} these are
 * the full picture — the drawer is where you go to see everything — but they
 * stay one fact per line rather than a wrap of chips you have to decode.
 *
 * Same split as above: structure here, wording in the UI's copy module.
 */
export type StatusFact =
	| { id: "role"; tier: Tier }
	| { id: "state"; stage: Stage; tone: Tone }
	| { id: "since"; days: number }
	| {
			id: "agreement";
			state: "not_required" | "signed" | "missing";
			variant?: "guest" | "member";
	  }
	| {
			id: "door";
			state: "open" | "closed" | "suspended" | "forced_open";
			actorName?: string;
	  }
	/** When their access runs out. Absent entirely for the people who have no
	 *  end date — a board member's line would read "—" forever. */
	| { id: "access_until"; at: number; local?: string }
	| { id: "former"; reason: "kicked" | "left" };

export type StatusFlagId = StatusFlag["id"];
export type StatusFactId = StatusFact["id"];

/**
 * An open board task. Carries the STEP ID as well as the label: the drawer's
 * "Done" button dispatches `completeBoardStep({ stepId })`, and a handler that
 * hardcodes `"whatsapp"` because that is the only entry today is a bug waiting
 * for the second board step. The label comes from `BOARD_STEPS`, which is
 * shared with the onboarding flow — the one bit of copy this module passes
 * through rather than owning.
 */
export type BoardTask = { id: BoardStepId; label: string };

export type PersonStatus = {
	/** Carried so the UI can word a headline without re-reading the person. */
	tier: Tier;
	stage: Stage;
	tone: Tone;
	/** Exceptions only; empty for a settled person. Drives the Flags column. */
	flags: StatusFlag[];
	/** Every line of the drawer's Status section, in display order. */
	facts: StatusFact[];
	boardTasks: BoardTask[];
	/** Whole days spent in the current stage. 0 means "entered today". */
	sinceDays: number;
};

function tierTone(person: LifecyclePerson): Tone {
	if (person.stage === "denied") return "error";
	if (person.tier === "former" || person.stage === "expired")
		return "neutral";
	if (person.tier === "prospect") return "info";
	if (person.stage === "onboarding") return "warning";
	return "success";
}

const DAY_MS = 86_400_000;

/** Whole days in the current stage; negative clock skew floors at 0. */
function daysInStage(stageSince: number, now: number): number {
	return Math.max(0, Math.floor((now - stageSince) / DAY_MS));
}

/**
 * The single status readout. Drives the drawer's Status section, the table's
 * Flags column and the row grouping, so those three can never tell different
 * stories.
 *
 * It answers two different questions with two different fields.
 * {@link PersonStatus.flags} is "what would surprise the board about this row",
 * shown in the table where tier and stage are already on screen;
 * {@link PersonStatus.facts} is "everything about this person's state", shown
 * in the drawer where nothing else is. Neither is derived from the other, and
 * the flag set is deliberately much smaller.
 *
 * `doorActorName` is optional because the function is pure: the caller resolves
 * `door.byId` to a name when it has one, and the label degrades to "the board"
 * when it does not.
 */
export function personStatus(
	person: LifecyclePerson,
	signatureVariants: string[],
	now: number,
	doorActorName?: string
): PersonStatus {
	const sinceDays = daysInStage(person.stageSince, now);
	const required = agreementVariantFor(person.tier);
	const met = compliance(person, signatureVariants) === "met";
	const override = person.door?.override ?? "none";
	// Gated here, once, rather than at each call site: the raw field survives
	// `RE_ADMIT`, so it only means anything while the person is still former.
	const formerReason =
		person.tier === "former" ? person.formerReason : undefined;

	// Board tasks belong to the tiers that onboard at all —
	// `agreementVariantFor(tier) !== null` is exactly "guest | member | core" —
	// and stay open until a board member ticks them, onboarding OR active. Not
	// onboarding alone: a guest finishes their own steps within minutes, so a
	// task that closed on activation was one the board almost never saw. Board,
	// admin, staff, former and expired people carry none.
	const onboards = agreementVariantFor(person.tier) !== null;
	const done = person.onboarding?.boardSteps ?? {};
	const boardTasks: BoardTask[] =
		onboards && isLiveStage(person.stage)
			? BOARD_STEPS.filter((t) => !(t.id in done)).map((t) => ({
					id: t.id,
					label: t.label,
				}))
			: [];

	// Exceptions only. Anything the tab, the group header or another column
	// already says is deliberately absent — see StatusFlag.
	const flags: StatusFlag[] = [];
	if (required !== null && !met)
		flags.push({ id: "agreement_missing", variant: required });
	// Board work nobody else can see. It does not gate activation — a board
	// member forgetting it must not hold anyone up — but it is the board's own
	// backlog, and the drawer was the only place it appeared, which is exactly
	// the "invisible until you go looking" problem the column exists to fix.
	for (const task of boardTasks)
		flags.push({ id: "board_task_pending", step: task.id });
	if (override === "force_off")
		flags.push({ id: "door_suspended", actorName: doorActorName });
	if (override === "force_on")
		flags.push({ id: "door_forced_open", actorName: doorActorName });
	const facts: StatusFact[] = [
		{ id: "role", tier: person.tier },
		{ id: "state", stage: person.stage, tone: tierTone(person) },
		{ id: "since", days: sinceDays },
		{
			id: "agreement",
			state:
				required === null ? "not_required" : met ? "signed" : "missing",
			variant: required ?? undefined,
		},
		{
			id: "door",
			state:
				override === "force_off"
					? "suspended"
					: override === "force_on"
						? "forced_open"
						: entitled(person, now)
							? "open"
							: "closed",
			actorName: doorActorName,
		},
	];
	// Only when there is one. Most people have no end date, and a line reading
	// "Access until —" on every board member is noise that teaches the reader to
	// skip the section the one time it says something.
	if (person.accessUntil != null)
		facts.push({
			id: "access_until",
			at: person.accessUntil,
			local: person.accessUntilLocal,
		});
	if (formerReason !== undefined)
		facts.push({ id: "former", reason: formerReason });

	// A missing agreement or a suspended door is the row's headline problem;
	// a voluntary departure is not a problem at all, so it must not turn the
	// summary red — which is why this asks which flags are present rather than
	// whether any are.
	const alarming = flags.some(
		(f) => f.id === "agreement_missing" || f.id === "door_suspended"
	);
	const tone: Tone = alarming ? "error" : tierTone(person);

	return {
		tone,
		tier: person.tier,
		stage: person.stage,
		flags,
		facts,
		boardTasks,
		sinceDays,
	};
}
