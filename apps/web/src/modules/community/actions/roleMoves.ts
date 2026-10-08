import type { RoleTier } from "./triage.ts";

/** What the caller should do with the board's choice. */
export type RoleMove =
	| {
			kind: "event";
			event:
				| "PROMOTE_TO_MEMBER"
				| "GRANT_CORE"
				| "REVOKE_CORE"
				| "PROMOTE_TO_BOARD"
				| "RE_ADMIT"
				| "MARK_LEFT"
				| "KICK_OUT";
	  }
	| { kind: "role"; tier: RoleTier }
	| { kind: "extendWindow"; until: number };

/**
 * One row per DESTINATION, not per event.
 *
 * Several events can reach the same tier — `PROMOTE_TO_MEMBER`, `REVOKE_CORE`
 * and `SET_ROLE { tier: "member" }` all land on member — and the board picks
 * where a person should end up, not which edge to traverse. So each row lists
 * the events that reach its destination in `via`, **most specific first**.
 *
 * A row is offered when SOME event in `via` is legal for EVERY selected row, and
 * the first such event is the one dispatched. Order is load-bearing:
 * `PROMOTE_TO_MEMBER` re-opens the document step, sends the `memberUpgrade`
 * email and clears the guest window, none of which a bare `SET_ROLE` does, so
 * it has to win wherever it is available. `SET_ROLE` is the last resort in
 * every list precisely because it is legal from almost everywhere.
 *
 * `tier` is set on the rows `SET_ROLE` can serve; it is both the payload it
 * carries and the row's own "you are already here" suppression key.
 *
 * INVARIANT — a batch must not mix guests with non-guests. "Some event legal for
 * EVERY row" means a selection holding a guest and a member resolves "Member" to
 * SET_ROLE{member} rather than PROMOTE_TO_MEMBER, silently skipping the
 * re-opened document step, the memberUpgrade email and CLEAR_WINDOW. Nothing
 * here can detect that, because by this point a guest and a member look like two
 * StateIds. It holds today because this dialog is mounted only from the Members
 * tab and `memberGroup` has no guest bucket. If a Guests tab ever grows a
 * ChangeRoleDialog, promote guests through the guest-only path, not this one.
 * Both directions are pinned in ChangeRoleDialog.test.tsx.
 */
export const MOVES = [
	{
		value: "member",
		label: "Member",
		tier: "member",
		via: ["PROMOTE_TO_MEMBER", "REVOKE_CORE", "SET_ROLE"],
	},
	{
		value: "core",
		// "Core member", not "Core", to match the roster's own group heading.
		// The board reads the table first and comes here looking for the
		// destination by the name the table gave it; a row labelled "Core"
		// reads as a different, unrelated thing, and the option was reported
		// missing when it had been on screen the whole time.
		label: "Core member",
		tier: "core",
		via: ["GRANT_CORE", "SET_ROLE"],
	},
	{
		value: "board",
		label: "Board",
		tier: "board",
		via: ["PROMOTE_TO_BOARD", "SET_ROLE"],
	},
	{ value: "admin", label: "Admin", tier: "admin", via: ["SET_ROLE"] },
	{ value: "staff", label: "Staff", tier: "staff", via: ["SET_ROLE"] },
	{
		value: "guest_window",
		label: "Guest window",
		tier: undefined,
		via: ["EXTEND_WINDOW"],
	},
	{ value: "readmit", label: "Re-admit", tier: undefined, via: ["RE_ADMIT"] },
	{
		value: "left",
		// Every other option here names a destination — "Member", "Board",
		// "Core member" — so this one does too. Both this and "Kick out" end
		// in the same `former` tier; the difference is whose decision it was,
		// and "Alumni" carries that the way the roster's group heading does.
		label: "Alumni",
		tier: undefined,
		via: ["MARK_LEFT"],
	},
	{ value: "kick", label: "Kick out", tier: undefined, via: ["KICK_OUT"] },
] as const;
