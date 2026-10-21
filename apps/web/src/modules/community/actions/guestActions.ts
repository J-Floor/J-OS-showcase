import { displayName } from "../../../../convex/lib/names.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { GuestRow } from "../columns/guestColumns.tsx";
import { useOpenAgreement } from "../openAgreement.ts";

import { agreementAction } from "./agreementAction.ts";
import { settleRosterAction } from "./RosterActionError.tsx";
import type { ActionDescriptor, RosterActionOutcome } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

// A guest whose access already ended (expired, or already former) can't be
// kicked out a second time.
function expired(person: GuestRow): boolean {
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
	actions: () => ActionDescriptor<GuestRow>[];
} {
	const triage = useTriage();
	const confirm = useConfirm();
	const agreement = useOpenAgreement();

	async function upgrade(person: GuestRow): Promise<RosterActionOutcome> {
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

	async function kickOut(person: GuestRow): Promise<RosterActionOutcome> {
		if (
			await confirm({
				title: "Kick out?",
				message: `Revoke ${displayName(person)}'s guest access? They'll be moved to Kicked out, keeping their whole history.`,
				confirmLabel: "Kick out",
				tone: "danger",
			})
		)
			return settleRosterAction(
				"guests",
				person._id,
				triage.kickOut(person._id)
			);
	}

	function actions(): ActionDescriptor<GuestRow>[] {
		return [
			{
				id: "member",
				label: "Upgrade to member",
				icon: ICONS.upgradeToMember,
				hotkey: "M",
				scope: "guests",
				can: () => true,
				run: (person) => upgrade(person),
			},
			{
				id: "kick",
				label: "Kick out",
				icon: ICONS.kickOut,
				hotkey: "K",
				scope: "guests",
				can: (person) => !expired(person),
				disabledReason: () => "Guest access has already ended",
				run: (person) => kickOut(person),
			},
			agreementAction(agreement, "guests"),
		];
	}

	return { actions };
}
