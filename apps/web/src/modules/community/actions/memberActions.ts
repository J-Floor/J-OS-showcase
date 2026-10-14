import { displayName } from "../../../../convex/lib/names.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";
import type { MemberRow } from "../columns/memberColumns.tsx";
import { useOpenAgreement } from "../openAgreement.ts";

import { agreementAction } from "./agreementAction.ts";
import type { ActionDescriptor } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

/**
 * What the board can do to a member from the roster or the drawer.
 *
 * `can` is the single gating rule: the row button, the batch bar and the key
 * binding all ask it, so a kicked-out member cannot be kicked out again from
 * any of the three. `group` is injected rather than imported from
 * `memberColumns` — that module renders this hook's own output, and importing
 * `memberGroup` here would close the cycle.
 *
 * The agreement action's availability rides on {@link useOpenAgreement}'s
 * `loading`, not just `hasAgreement`: a click already in flight must disable
 * the button too, or a second click opens a second blank tab.
 */
export function useMemberActions(options: {
	onChangeRole: (person: MemberRow) => void;
	group: (person: MemberRow) => string;
}): { actions: () => ActionDescriptor<MemberRow>[] } {
	const triage = useTriage();
	const confirm = useConfirm();
	const agreement = useOpenAgreement();

	async function kickOut(person: MemberRow): Promise<void> {
		if (
			await confirm({
				title: "Kick out?",
				message: `Revoke ${displayName(person)}'s access? They'll be moved to Kicked out, keeping their whole history.`,
				confirmLabel: "Kick out",
				tone: "danger",
			})
		)
			await triage.kickOut(person._id);
	}

	function actions(): ActionDescriptor<MemberRow>[] {
		return [
			{
				id: "role",
				label: "Change role",
				icon: ICONS.role,
				hotkey: "R",
				scope: "members",
				can: () => true,
				run: (person) => {
					options.onChangeRole(person);
				},
			},
			{
				id: "kick",
				label: "Kick out",
				icon: ICONS.kickOut,
				hotkey: "K",
				scope: "members",
				can: (person) => options.group(person) !== "kicked_out",
				disabledReason: () => "Already kicked out",
				run: (person) => kickOut(person),
			},
			agreementAction(agreement, "members"),
		];
	}

	return { actions };
}
