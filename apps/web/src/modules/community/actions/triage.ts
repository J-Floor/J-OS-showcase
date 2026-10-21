import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import type { ResultAsync } from "neverthrow";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { LifecycleEvent } from "../../../../convex/lib/lifecycleTypes.ts";
import { call, type ClientError } from "../../../lib/call.ts";

/** The tiers `SET_ROLE` can target. */
export type RoleTier = Extract<LifecycleEvent, { type: "SET_ROLE" }>["tier"];

/** What every triage action resolves to; the caller shows the failure. */
export type TriageResult = ResultAsync<unknown, ClientError>;

type TransitionEvent = FunctionArgs<typeof api.lifecycle.transition>["event"];

const DECIDE_FALLBACK = "Could not save that decision.";
const MOVE_FALLBACK = "Could not make that change.";

/**
 * Triage actions for the community tabs. Thin wrappers over the board-gated
 * Convex mutations. Each returns a Result so callers can `await` it (batch
 * actions loop over the selected rows and stop at the first failure) and show
 * the failure where the action was taken.
 *
 * Everything that changes a person's position in the lifecycle goes through
 * `api.lifecycle.transition`, so the console cannot invent a move the machine
 * does not have.
 */
export function useTriage() {
	const decide = useMutation(api.applications.decide);
	const undeny = useMutation(api.applications.undeny);
	const transition = useMutation(api.lifecycle.transition);

	function move(
		personId: Id<"people">,
		event: TransitionEvent
	): TriageResult {
		return call(transition.mutateAsync({ personId, event }), MOVE_FALLBACK);
	}

	return {
		deny: (personId: Id<"people">): TriageResult =>
			call(
				decide.mutateAsync({ personId, decision: { kind: "deny" } }),
				DECIDE_FALLBACK
			),
		makeMember: (personId: Id<"people">): TriageResult =>
			call(
				decide.mutateAsync({ personId, decision: { kind: "member" } }),
				DECIDE_FALLBACK
			),
		/** `until` is optional — omitting it grants open-ended guest access. */
		approveAsGuest: (
			personId: Id<"people">,
			until: number | undefined,
			hostedById: Id<"people">,
			shouldBlockDoor: boolean
		): TriageResult =>
			call(
				decide.mutateAsync({
					personId,
					decision: {
						kind: "guest",
						until,
						hostedById,
						blockDoor: shouldBlockDoor,
					},
				}),
				DECIDE_FALLBACK
			),
		undeny: (personId: Id<"people">): TriageResult =>
			call(undeny.mutateAsync({ personId }), DECIDE_FALLBACK),
		kickOut: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "KICK_OUT" }),
		markLeft: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "MARK_LEFT" }),
		reAdmit: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "RE_ADMIT" }),
		upgradeToMember: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "PROMOTE_TO_MEMBER" }),
		grantCore: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "GRANT_CORE" }),
		revokeCore: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "REVOKE_CORE" }),
		promoteToBoard: (personId: Id<"people">): TriageResult =>
			move(personId, { type: "PROMOTE_TO_BOARD" }),
		// Every role move, both directions. This replaces the old `demoteToMember`,
		// and it is the only non-destructive way out of board.active.
		setRole: (personId: Id<"people">, tier: RoleTier): TriageResult =>
			move(personId, { type: "SET_ROLE", tier }),
		extendWindow: (personId: Id<"people">, until: number): TriageResult =>
			move(personId, { type: "EXTEND_WINDOW", until }),
	};
}
