import { displayName } from "../../../../convex/lib/names.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import type {
	ActionDescriptor,
	ActionOutcome,
} from "../../../shared/actions/shortcuts.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import { useOpenAgreement } from "../openAgreement.ts";

import { agreementAction } from "./agreementAction.ts";
import { useKickOutAction } from "./kickOutAction.ts";
import { settleRosterAction } from "./RosterActionError.tsx";
import { useTriage } from "./triage.ts";
import { useTriageBatch } from "./triageBatch.ts";

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
	const batch = useTriageBatch("guests");

	async function upgrade(person: PersonRow): Promise<ActionOutcome> {
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

	// Built once: the key and the footer button must hold the same objects,
	// or the run guard (`runAction`) cannot tell they are one action.
	const list: ActionDescriptor<PersonRow>[] = [
		{
			id: "member",
			label: "Upgrade to member",
			icon: ICONS.upgradeToMember,
			hotkey: "M",
			celebrate: true,
			can: () => true,
			run: (person) => upgrade(person),
			runBatch: (people) =>
				batch(people, triage.upgradeToMember, {
					title: "Upgrade to member?",
					message: `Promote ${String(people.length)} guest(s) to full members? They'll each be emailed an invite.`,
					confirmLabel: "Upgrade",
				}),
		},
		kickOut,
		agreementAction(agreement),
	];

	return { actions: () => list };
}
