import type {
	PersonStatus,
	StatusFact,
	StatusFlag,
	Tone,
} from "../../../../convex/lib/derive.ts";
import type {
	EventType,
	Stage,
	Tier,
} from "../../../../convex/lib/lifecycleTypes.ts";
import {
	BOARD_STEPS,
	type BoardStepId,
	RETIRED_DOOR_KEY_STEP_ID,
} from "../../../../convex/lib/onboardingSteps.ts";
import {
	formatDateOnly,
	guestChosenIso,
	isoToUtcMidnight,
	SITE_TIMEZONE,
} from "../../../../convex/lib/time.ts";
import { ICONS } from "../../../shared/icons.ts";
import { LOCK_SLOTS } from "../../space/lockSlots.ts";

/**
 * Every user-facing word for a person's lifecycle status, in one file.
 *
 * `convex/lib/derive.ts` decides what is true; this decides how it reads. The
 * split is deliberate: wording changes should not need a backend deploy, and
 * the machine's rules should be reviewable without wading through prose. Both
 * the table's Flags column and the drawer's Status section render from here, so
 * they still cannot word the same fact two different ways.
 */

const TIER_LABEL: Record<Tier, string> = {
	// The machine calls this tier `prospect`; the board calls these people
	// applicants, which is also what the tab they sit under is called. The
	// stored value is unchanged — this file exists precisely so the word on
	// screen and the word in the schema do not have to be the same one.
	prospect: "Applicant",
	guest: "Guest",
	member: "Member",
	core: "Core member",
	board: "Board",
	admin: "Admin",
	staff: "Staff",
	former: "Former",
	visitor: "Visitor",
};

const STAGE_LABEL: Record<Stage, string> = {
	unverified: "Unverified",
	verified: "Verified",
	queued: "In queue",
	denied: "Denied",
	onboarding: "Onboarding",
	active: "Active",
	expired: "Expired",
};

const AGREEMENT_NAME: Record<"guest" | "member", string> = {
	guest: "Guest agreement",
	member: "Member agreement",
};

/**
 * What an outstanding board step reads as in the Flags column. The board's own
 * checklist wording ("Add to WhatsApp group") is an instruction; a flag has to
 * be a statement of what is missing.
 */
const BOARD_TASK_PENDING: Record<BoardStepId, string> = {
	whatsapp: "Not added to WhatsApp group",
};

/** Who flipped the door override. Degrades when the name is unresolved. */
function byWhom(actorName: string | undefined): string {
	return actorName ?? "the board";
}

/** "Member · Active" — the drawer's one-line summary of a whole status. */
export function headline(status: PersonStatus): string {
	return `${TIER_LABEL[status.tier]} · ${STAGE_LABEL[status.stage]}`;
}

/**
 * When they entered their current state, worded as an answer to "since when".
 *
 * A point in time, not a duration: under the "State since" label, "Today" and
 * "3 days ago" both read as sentences, where a bare "3 days" would not.
 */
export function sinceLabel(days: number): string {
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	return `${String(days)} days ago`;
}

/**
 * A flag as it appears in the table, where it stands alone in a cell with no
 * label beside it — so each one is a complete statement. Contrast
 * {@link factLine}, where the label carries half the meaning.
 */
export function flagLabel(flag: StatusFlag): string {
	switch (flag.id) {
		case "agreement_missing":
			return `${AGREEMENT_NAME[flag.variant]} not signed`;
		case "board_task_pending":
			return BOARD_TASK_PENDING[flag.step];
		// "Door forced open by X" read as though the physical door were
		// standing open, when it means X can get in regardless of the rules.
		// The drawer solved this with a "Door access" label carrying half the
		// sentence; a flag has no label to lean on, so "Door access" has to be
		// part of the flag's own words. "Blocked by X" still reads fine on its
		// own, matching the drawer's Status line; the always-on case puts the
		// actor in parentheses instead, exactly as the drawer's "Allowed
		// forever (X)" does.
		case "door_suspended":
			return `Door access blocked by ${byWhom(flag.actorName)}`;
		case "door_forced_open":
			return `Door access always on (${byWhom(flag.actorName)})`;
	}
}

/**
 * Every flag the machine can raise, for the Flags column's filter. Written out
 * rather than derived, because a filter needs its options up front — before any
 * row has been seen — and a list built from the rows on screen quietly hides
 * the filter you most want ("show me everyone blocked") exactly when nobody
 * currently matches it.
 *
 * The wording is generic where a real flag names a person: the filter offers
 * "Door access blocked", the row says who blocked it. Kept word-for-word in
 * step with {@link flagLabel} minus the actor, so filtering by one of these
 * and reading a row that says something else never happens.
 */
export const FLAG_FILTER_OPTIONS: readonly { value: string; label: string }[] =
	[
		{ value: "agreement_missing", label: "Agreement not signed" },
		// One option per board step, worded as its row flag — a generic
		// "Board to-do outstanding" matched rows that said "Not added to
		// WhatsApp group", which is exactly the mismatch this list rules out.
		...BOARD_STEPS.map((step) => ({
			value: flagFilterValue({ id: "board_task_pending", step: step.id }),
			label: BOARD_TASK_PENDING[step.id],
		})),
		{ value: "door_suspended", label: "Door access blocked" },
		{ value: "door_forced_open", label: "Door access always on" },
	];

/**
 * The value a flag files under in the Flags column filter: its id, plus the
 * step for a board task, so each board step is its own option.
 */
export function flagFilterValue(flag: StatusFlag): string {
	return flag.id === "board_task_pending"
		? `${flag.id}:${flag.step}`
		: flag.id;
}

/** Severity for a flag's badge. Only real problems are red. */
export function flagTone(flag: StatusFlag): Tone {
	switch (flag.id) {
		case "agreement_missing":
		case "door_suspended":
			return "error";
		// Board work outstanding, not a problem with the person — same weight
		// as a door left forced open.
		case "board_task_pending":
		case "door_forced_open":
			return "warning";
	}
}

export type FactLine = {
	icon: string;
	label: string;
	value: string;
	/** Set only where the value is worth colouring; most lines read as plain
	 *  text so the section stays a list rather than a wall of pills. */
	tone?: Tone;
};

/**
 * A fact as one labelled line. The value never repeats its own label — "Agreement /
 * Not signed", not "Agreement / Member agreement not signed".
 */
export function factLine(fact: StatusFact): FactLine {
	switch (fact.id) {
		case "role":
			return {
				icon: ICONS.role,
				label: "Role",
				value: TIER_LABEL[fact.tier],
			};
		case "state":
			return {
				icon: ICONS.status,
				label: "State",
				value: STAGE_LABEL[fact.stage],
				tone: fact.tone,
			};
		case "since":
			// "Since" alone did not say since WHAT. This line always sits
			// directly under "State", and that is exactly what it dates — so
			// the label names it rather than leaving the reader to infer the
			// pairing from the layout.
			return {
				icon: ICONS.time,
				label: "State since",
				value: sinceLabel(fact.days),
			};
		case "agreement":
			return {
				icon: ICONS.agreement,
				label: "Agreement",
				value:
					fact.state === "not_required"
						? "Not required"
						: fact.state === "signed"
							? "Signed"
							: "Not signed",
				tone:
					fact.state === "missing"
						? "error"
						: fact.state === "signed"
							? "success"
							: undefined,
			};
		case "door":
			// "Door: Open" read as a statement about the building. This line is
			// about one person: whether the lock lets THEM in right now.
			return {
				icon: ICONS.door,
				label: "Door access",
				value:
					fact.state === "suspended"
						? `Blocked by ${byWhom(fact.actorName)}`
						: fact.state === "forced_open"
							? // Not "forced by X": that said who did it but not what
								// it costs. The override never expires, so this
								// person keeps getting in long after their
								// membership ends. "Forever" is the part worth
								// reading; the actor is the footnote.
								`Allowed forever (${byWhom(fact.actorName)})`
							: fact.state === "open"
								? "Allowed"
								: "Not allowed",
				tone:
					fact.state === "suspended"
						? "error"
						: fact.state === "forced_open"
							? "warning"
							: undefined,
			};
		case "access_until":
			// No tone: the State line already says "Expired" when this date has
			// passed, and colouring both makes one expiry look like two
			// problems.
			return {
				icon: "event_busy",
				label: "Access until",
				// Site-zone chosen END day, matching AccessUntilControl — not the
				// admin's browser zone. `guestChosenIso` handles the three
				// encodings (absent local, 00:00:01 end-of-day-exclusive, or a
				// preserved arbitrary instant); the result is a plain YYYY-MM-DD
				// rendered short via the date-only formatter.
				value: formatDateOnly(
					isoToUtcMidnight(
						guestChosenIso(fact.local, fact.at, SITE_TIMEZONE)
					)
				),
			};
		case "former":
			return {
				icon: ICONS.departed,
				label: "How they left",
				value:
					fact.reason === "kicked"
						? "Kicked out"
						: "Left voluntarily",
				tone: fact.reason === "kicked" ? "error" : undefined,
			};
	}
}

/**
 * What happened, in words, for the drawer's History section.
 *
 * The timeline used to print the machine's own tokens — "SIGN_AGREEMENT",
 * "member.active" — which is fine in an audit table and useless to a board
 * member reading someone's history. The event names are the machine's
 * vocabulary; these are the board's.
 */
const EVENT_LABEL: Record<EventType, string> = {
	VERIFY_EMAIL: "Verified their email address",
	SET_SCORE: "Scored by the board",
	APPROVE_GUEST: "Approved as a guest",
	APPROVE_MEMBER: "Approved as a member",
	DENY: "Application turned down",
	UNDENY: "Turn-down undone",
	ONBOARDING_PROGRESSED: "Finished onboarding",
	PROMOTE_TO_MEMBER: "Upgraded from guest to member",
	PROMOTE_TO_BOARD: "Joined the board",
	SET_ROLE: "Role changed by the board",
	IMPORT: "Imported from the old Notion workspace",
	GRANT_CORE: "Made a core member",
	REVOKE_CORE: "Core membership removed",
	EXTEND_WINDOW: "Guest access extended",
	WINDOW_EXPIRED: "Guest access ran out",
	KICK_OUT: "Kicked out",
	MARK_LEFT: "Left the space",
	RE_ADMIT: "Re-admitted",
	REAPPLY: "Applied again",
};

/**
 * Event names that appear in stored history but not in the machine's current
 * vocabulary. The audit log keeps whatever was written at the time, so the
 * pre-statechart names outlive the code that wrote them — production holds 245
 * `SUBMIT` rows and 109 `SIGN_AGREEMENT` rows, and they were rendering as raw
 * tokens in the drawer's History section.
 *
 * These are history: nothing writes them any more, and nothing should. Deleting
 * an entry here does not delete the rows it names — it just makes them
 * unreadable again.
 */
const LEGACY_EVENT_LABEL: Record<string, string> = {
	SUBMIT: "Applied to join",
	SIGN_AGREEMENT: "Signed the agreement",
	// Written by the seed's fixture history, and by the earliest sign-ups.
	SIGN_UP: "Signed up",
	// Renamed to SET_ROLE.
	SET_STAFF: "Role changed by the board",
};

/**
 * Falls back to the raw token rather than hiding an event we forgot to name.
 * `hasOwn` rather than `??`: the record is keyed by `EventType` so a lookup
 * types as `string`, and the audit log holds whatever was written when the row
 * was created — including events since renamed.
 */
export function eventLabel(event: string | undefined): string {
	if (event === undefined) return "Changed";
	if (Object.hasOwn(EVENT_LABEL, event))
		return EVENT_LABEL[event as EventType];
	return LEGACY_EVENT_LABEL[event] ?? event;
}

/** "member.active" as the board reads it. */
export function stateLabel(state: string | undefined): string | undefined {
	if (state === undefined) return undefined;
	const [tier, stage] = state.split(".");
	const tierLabel = TIER_LABEL[tier as Tier] as string | undefined;
	const stageLabel = STAGE_LABEL[stage as Stage] as string | undefined;
	if (tierLabel === undefined || stageLabel === undefined) return state;
	// Sentence case for a sentence: the labels are written for a column header
	// ("Core member", "In queue"), and reading "Now Core member, In queue" mid
	// sentence is worse than lowercasing them here. Not a CSS transform — this
	// string is data the Timeline renders, not a styled element of its own.
	// eslint-disable-next-line no-restricted-syntax -- see above
	return `Now ${tierLabel.toLowerCase()}, ${stageLabel.toLowerCase()}`;
}

const STEP_LABEL: Record<string, string> = {
	welcome: "the welcome screen",
	document: "the agreement",
	rules: "the house rules",
	[RETIRED_DOOR_KEY_STEP_ID]: "door-key setup",
	visit: "their first visit",
};

/** "Completed onboarding step: document" → "Completed the agreement". */
export function stepLabel(step: unknown): string {
	return typeof step === "string" ? (STEP_LABEL[step] ?? step) : "a step";
}

/** Board-facing name for a field the audit log recorded an edit to. */
const FIELD_LABEL: Record<string, string> = {
	phone: "Phone",
	firstName: "First name",
	lastName: "Last name",
	hostedBy: "Hosted by",
	hostNote: "Host note",
	ventureName: "Venture",
	vertical: "Verticals",
	notes: "Board notes",
};

export function fieldLabel(field: string | undefined): string {
	if (field === undefined) return "A field";
	return FIELD_LABEL[field] ?? field;
}

/** A door audit row records the override it moved to. */
export function doorEventLabel(override: unknown): string {
	if (override === "force_off") return "Door access blocked by the board";
	if (override === "force_on") return "Door access forced open by the board";
	return "Door override cleared — back to normal rules";
}

/** "the Downstairs door", worded from the Space page's own door labels so the
 *  timeline and the unlock buttons never name a door differently. */
function doorName(slot: unknown): string {
	const label = LOCK_SLOTS.find((s) => s.slot === slot)?.label;
	return label === undefined ? "a door" : `the ${label} door`;
}

/** A door the person unlocked or locked from the app. A failed one says so:
 *  "Unlocked" on a door that never opened would be a false alibi. */
export function doorActionLabel(
	action: unknown,
	slot: unknown,
	outcome: unknown
): string {
	const verb = action === "lock" ? "lock" : "unlock";
	if (outcome === "busy")
		return `Tried to ${verb} ${doorName(slot)} — the lock was still busy`;
	if (outcome !== "ok") return `Tried to ${verb} ${doorName(slot)} — failed`;
	return `${verb === "lock" ? "Locked" : "Unlocked"} ${doorName(slot)}`;
}

const EMAIL_LABEL: Record<string, string> = {
	approval: "you're in",
	rejection: "application turned down",
	upgrade: "upgraded to member",
	verify: "verify your email",
	expiry: "guest access ending",
};

export function emailLabel(kind: unknown): string {
	return typeof kind === "string"
		? (EMAIL_LABEL[kind] ?? kind)
		: "notification";
}
