import { useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { LifecycleEvent } from "../../../../convex/lib/lifecycleTypes.ts";

/** The tiers `SET_ROLE` can target. */
export type RoleTier = Extract<LifecycleEvent, { type: "SET_ROLE" }>["tier"];

/**
 * Triage actions for the community tabs. Thin wrappers over the board-gated
 * Convex mutations. Each returns the mutation promise so callers can `await`
 * (batch actions loop over the selected rows and await each).
 *
 * Everything that changes a person's position in the lifecycle goes through
 * `api.lifecycle.transition`, so the console cannot invent a move the machine
 * does not have.
 */
export function useTriage() {
	const decide = useMutation(api.applications.decide);
	const undeny = useMutation(api.applications.undeny);
	const transition = useMutation(api.lifecycle.transition);

	return {
		deny: (personId: Id<"people">) =>
			decide.mutate({ personId, decision: { kind: "deny" } }),
		makeMember: (personId: Id<"people">) =>
			decide.mutate({ personId, decision: { kind: "member" } }),
		/** `until` is optional — omitting it grants open-ended guest access. */
		approveAsGuest: (
			personId: Id<"people">,
			until: number | undefined,
			hostedById: Id<"people">,
			blockDoor: boolean
		) =>
			decide.mutate({
				personId,
				decision: { kind: "guest", until, hostedById, blockDoor },
			}),
		undeny: (personId: Id<"people">) => undeny.mutate({ personId }),
		kickOut: (personId: Id<"people">) =>
			transition.mutate({ personId, event: { type: "KICK_OUT" } }),
		markLeft: (personId: Id<"people">) =>
			transition.mutate({ personId, event: { type: "MARK_LEFT" } }),
		reAdmit: (personId: Id<"people">) =>
			transition.mutate({ personId, event: { type: "RE_ADMIT" } }),
		upgradeToMember: (personId: Id<"people">) =>
			transition.mutate({
				personId,
				event: { type: "PROMOTE_TO_MEMBER" },
			}),
		grantCore: (personId: Id<"people">) =>
			transition.mutate({ personId, event: { type: "GRANT_CORE" } }),
		revokeCore: (personId: Id<"people">) =>
			transition.mutate({ personId, event: { type: "REVOKE_CORE" } }),
		promoteToBoard: (personId: Id<"people">) =>
			transition.mutate({
				personId,
				event: { type: "PROMOTE_TO_BOARD" },
			}),
		// Every role move, both directions. This replaces the old `demoteToMember`,
		// and it is the only non-destructive way out of board.active.
		setRole: (personId: Id<"people">, tier: RoleTier) =>
			transition.mutate({ personId, event: { type: "SET_ROLE", tier } }),
		extendWindow: (personId: Id<"people">, until: number) =>
			transition.mutate({
				personId,
				event: { type: "EXTEND_WINDOW", until },
			}),
	};
}
