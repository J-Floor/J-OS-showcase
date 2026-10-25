import { displayName } from "../../../../convex/lib/names.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import type { ConfirmOptions } from "../../../shared/confirm.tsx";

/** Whose access a kick-out revokes: a member's, or a guest's. */
export type KickOutKind = "member" | "guest";

/**
 * The confirm for kicking people out, one wording for the row button, the key
 * and the selection bar. `target` is the person, or how many are selected.
 */
export function kickOutPrompt(
	kind: KickOutKind,
	target: PersonRow | number
): ConfirmOptions {
	const access = kind === "guest" ? "guest access" : "access";
	return {
		title: "Kick out?",
		message: `Revoke ${
			typeof target === "number"
				? `${access} for ${String(target)} person(s)`
				: `${displayName(target)}'s ${access}`
		}? They'll be moved to Kicked out, keeping their whole history.`,
		confirmLabel: "Kick out",
		tone: "danger",
	};
}
