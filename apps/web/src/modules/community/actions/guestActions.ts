import { displayName } from "../../../../convex/lib/names.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { useOpenAgreement } from "../openAgreement.ts";

import { agreementAction } from "./agreementAction.ts";
import { useKickOutAction } from "./kickOutAction.ts";
import { settleRosterAction } from "./RosterActionError.tsx";
import type { ActionDescriptor, RosterActionOutcome } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

// A guest whose access already ended (expired, or already former) can't be
// kicked out a second time.
function expired(person: PersonRow): boolean {
	return person.stage === "expired" || person.tier === "former";
}

/**
 * What the board can do to a guest. `M` matches Applications' "make member":
 * same intent, same letter, different scope; `A` views the agreement, matching
 * Members. Agreement is a descriptor here like every other action — it was once a
 * standalone keyless button, which left it in a different place from the Members
 * tab and with no shortcut; folding it in fixes both.
 */
export function useGuestActions(): {
	actions: () => ActionDescriptor<PersonRow>[];
} {
	const triage = useTriage();
	const confirm = useConfirm();
	const agreement = useOpenAgreement();

	async function upgrade(person: PersonRow): Promise<RosterActionOutcome> {
		if (
			await confirm({
				title: "Upgrade to member?",
				message: `Promote ${displayName(person)} from guest to full member? They'll be emailed an invite.`,
				confirmLabel: "Upgrade",
			})
		)
			return settleRosterAction(
				"guests",
				person._id,
				triage.upgradeToMember(person._id)
			);
	}

	const kickOut = useKickOutAction("guest", {
		can: (person) => !expired(person),
		disabledReason: "Guest access has already ended",
	});

	function actions(): ActionDescriptor<PersonRow>[] {
		return [
			{
				id: "member",
				label: "Upgrade to member",
				icon: ICONS.upgradeToMember,
				hotkey: "M",
				scope: "guests",
				celebrate: true,
				can: () => true,
				run: (person) => upgrade(person),
			},
			kickOut,
			agreementAction(agreement, "guests"),
		];
	}

	return { actions };
}
