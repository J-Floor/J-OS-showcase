import type { PersonRow } from "../../../../convex/people.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";

import { kickOutPrompt, type KickOutKind } from "./kickOutPrompt.ts";
import { settleRosterAction } from "./RosterActionError.tsx";
import type { ActionDescriptor, RosterActionOutcome } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

/**
 * The "Kick out" row action (`K`), shared by the Members and Guests tabs: one
 * confirm wording, one letter, and each tab's own rule for who can still be
 * kicked out.
 */
export function useKickOutAction(
	kind: KickOutKind,
	rule: {
		can: (person: PersonRow) => boolean;
		disabledReason: string;
	}
): ActionDescriptor<PersonRow> {
	const triage = useTriage();
	const confirm = useConfirm();
	const scope = kind === "guest" ? "guests" : "members";

	async function kickOut(person: PersonRow): Promise<RosterActionOutcome> {
		if (await confirm(kickOutPrompt(kind, person)))
			return settleRosterAction(
				scope,
				person._id,
				triage.kickOut(person._id)
			);
	}

	return {
		id: "kick",
		label: "Kick out",
		icon: ICONS.kickOut,
		hotkey: "K",
		scope,
		can: rule.can,
		disabledReason: () => rule.disabledReason,
		run: (person) => kickOut(person),
	};
}
