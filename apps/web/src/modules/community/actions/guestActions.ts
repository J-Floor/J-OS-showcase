import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { GuestRow } from "../columns/guestColumns.tsx";
import { useOpenAgreement } from "../openAgreement.ts";

import type { ActionDescriptor } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

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

	function fullName(person: GuestRow): string {
		return `${person.firstName} ${person.lastName}`.trim();
	}

	// A guest whose access already ended (expired, or already former) can't be
	// kicked out a second time.
	function expired(person: GuestRow): boolean {
		return person.stage === "expired" || person.tier === "former";
	}

	async function upgrade(person: GuestRow): Promise<void> {
		if (
			await confirm({
				title: "Upgrade to member?",
				message: `Promote ${fullName(person)} from guest to full member? They'll be emailed an invite.`,
				confirmLabel: "Upgrade",
			})
		)
			await triage.upgradeToMember(person._id);
	}

	async function kickOut(person: GuestRow): Promise<void> {
		if (
			await confirm({
				title: "Kick out?",
				message: `Revoke ${fullName(person)}'s guest access? They'll be moved to Kicked out, keeping their whole history.`,
				confirmLabel: "Kick out",
				tone: "danger",
			})
		)
			await triage.kickOut(person._id);
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
			{
				id: "agreement",
				label: "View agreement",
				icon: ICONS.agreement,
				hotkey: "A",
				scope: "guests",
				can: (person) => person.hasAgreement && !agreement.loading(),
				// Two distinct answers, kept apart: "there is none" vs "one is on
				// its way" (mirrors the Members descriptor).
				disabledReason: (person) =>
					person.hasAgreement
						? "Opening…"
						: "No signed agreement on file",
				run: (person) => {
					agreement.open(person._id);
				},
			},
		];
	}

	return { actions };
}
