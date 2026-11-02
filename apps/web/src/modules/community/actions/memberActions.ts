import type { PersonRow } from "../../../../convex/people.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { ICONS } from "../../../shared/icons.ts";
import { useOpenAgreement } from "../openAgreement.ts";

import { agreementAction } from "./agreementAction.ts";
import { useKickOutAction } from "./kickOutAction.ts";

/**
 * What the board can do to a member from the roster or the sheet.
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
	onChangeRole: (person: PersonRow) => void;
	group: (person: PersonRow) => string;
}): { actions: () => ActionDescriptor<PersonRow>[] } {
	const agreement = useOpenAgreement();
	const kickOut = useKickOutAction("member", {
		can: (person) => options.group(person) !== "kicked_out",
		disabledReason: "Already kicked out",
	});

	// Built once: the key and the footer button must hold the same objects,
	// or the run guard (`runAction`) cannot tell they are one action.
	const list: ActionDescriptor<PersonRow>[] = [
		{
			id: "role",
			label: "Change role",
			icon: ICONS.role,
			hotkey: "R",
			can: () => true,
			run: (person) => {
				options.onChangeRole(person);
			},
		},
		kickOut,
		agreementAction(agreement),
	];

	return { actions: () => list };
}
