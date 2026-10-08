import type { Id } from "../_generated/dataModel";

import type { ACCESS_TIERS, ROLE_TIERS } from "./roles.ts";

/** Tier region — the coarse position in the lifecycle. */
export type Tier =
	| "prospect"
	| "guest"
	| "member"
	| "core"
	| "board"
	| "admin"
	| "staff"
	| "former"
	| "visitor";

/** Stage within a tier. Not every stage is legal in every tier; `TABLE` decides. */
export type Stage =
	| "unverified"
	| "verified"
	| "queued"
	| "denied"
	| "onboarding"
	| "active"
	| "expired";

/** A machine state, stored on the person as two plain strings. */
export type StateId = `${Tier}.${Stage}`;

export type LifecycleEvent =
	| { type: "VERIFY_EMAIL" }
	| { type: "SET_SCORE" }
	/** `hostedById` is the board member vouching for the guest; it must survive
	 *  the approval, which is what the old `approveAsGuest` patch did by hand.
	 *
	 *  `until` is OPTIONAL: an open-ended guest is a real thing the board grants
	 *  (a resident founder with no end date in sight), and `accessUntil` has
	 *  always been optional on the row — `windowOpen` reads a missing one as
	 *  "never closes" and `sendApprovalEmail` already has a windowless variant.
	 *  `EXTEND_WINDOW` is the one that still requires a date; extending nothing
	 *  to nowhere is not a move. */
	| { type: "APPROVE_GUEST"; until?: number; hostedById?: Id<"people"> }
	| { type: "APPROVE_MEMBER" }
	| { type: "DENY" }
	/** Board undo for a mis-clicked deny: back into the queue, `deniedAt` cleared
	 *  so the re-application debounce stops blocking them. */
	| { type: "UNDENY" }
	| { type: "ONBOARDING_PROGRESSED" }
	| { type: "PROMOTE_TO_MEMBER" }
	/** Board console edge: an active member or core member joins the board. */
	| { type: "PROMOTE_TO_BOARD" }
	/** Every role move, in both directions: member/core ↔ board ↔ admin ↔
	 *  staff. Legal from (almost) any state, so nothing patches a role field
	 *  directly — this is what `people.addDirect`, the Notion import and the
	 *  console's role editor all dispatch. Carries the TARGET tier.
	 *
	 *  Demotions matter as much as promotions: `board.active` otherwise has no
	 *  non-destructive exit at all. */
	| {
			type: "SET_ROLE";
			tier: (typeof ROLE_TIERS)[number];
	  }
	/** Internal: a person imported from Notion enters at their tier, active when
	 *  an agreement is already on file and onboarding when it is not. */
	| {
			type: "IMPORT";
			tier: "guest" | "member" | "core";
			hasSignature: boolean;
	  }
	| { type: "GRANT_CORE" }
	| { type: "REVOKE_CORE" }
	| { type: "EXTEND_WINDOW"; until: number }
	| { type: "WINDOW_EXPIRED" }
	| { type: "KICK_OUT" }
	| { type: "MARK_LEFT" }
	| { type: "RE_ADMIT" }
	| { type: "REAPPLY" };

export type EventType = LifecycleEvent["type"];

/**
 * Everything a guard may read, loaded from the database BEFORE `reduce` runs.
 * The reducer never touches `ctx`, which is what makes it unit-testable.
 */
export type Facts = {
	/** Email ownership confirmed (`verifiedAt != null`). */
	verified: boolean;
	/** A signature exists whose variant matches the person's current tier. */
	complianceMet: boolean;
	/** Every required self-serve onboarding step is complete. */
	selfStepsComplete: boolean;
	/** Has been in an active stage of a membership tier before (`people.activatedAt` is set).
	 *  Onboarding steps are an entry ritual: someone who was active once has
	 *  nothing left to onboard. The agreement still matters. */
	everActive: boolean;
	/** The access window is currently open (or there is no window). */
	windowOpen: boolean;
	/** For `former` people: the tier they held, used by RE_ADMIT. */
	formerOf?: (typeof ACCESS_TIERS)[number];
};

/** Declarative side effects. The reducer returns them; the mutation runs them. */
export type Effect =
	| {
			type: "EMAIL";
			template:
				| "approval"
				| "rejection"
				| "memberUpgrade"
				| "applicationReceived";
	  }
	| { type: "NOTIFY_BOARD" }
	| { type: "RESET_STEP"; step: "document" }
	/** Opens the access window. A missing `until` is an OPEN-ENDED grant, not a
	 *  no-op: it still stamps `accessFrom`, and it clears any `accessUntil` the
	 *  row was carrying. */
	| { type: "SET_WINDOW"; until?: number }
	| { type: "CLEAR_WINDOW" }
	| { type: "SET_HOST"; hostedById: Id<"people"> }
	| { type: "SCHEDULE_WINDOW_EXPIRY"; at: number }
	| { type: "RECONCILE_DOOR" }
	| { type: "SET_DENIED_AT" }
	| { type: "CLEAR_DENIED_AT" }
	| { type: "RESET_SCORE" }
	| { type: "SET_FORMER"; reason: "kicked" | "left" };

export class IllegalTransitionError extends Error {
	readonly from: StateId;
	readonly event: EventType;

	constructor(from: StateId, event: EventType) {
		super(`Illegal transition ${from} -[${event}]->`);
		this.name = "IllegalTransitionError";
		this.from = from;
		this.event = event;
	}
}
