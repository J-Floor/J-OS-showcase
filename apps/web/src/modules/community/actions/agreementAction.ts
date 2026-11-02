import type { Id } from "../../../../convex/_generated/dataModel";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { ICONS } from "../../../shared/icons.ts";
import type { useOpenAgreement } from "../openAgreement.ts";

/**
 * The "View agreement" row action (`A`), shared by the Members and Guests tabs
 * so the same intent keeps the same letter, place and reasons on both.
 */
export function agreementAction<
	Person extends { _id: Id<"people">; hasAgreement: boolean },
>(agreement: ReturnType<typeof useOpenAgreement>): ActionDescriptor<Person> {
	return {
		id: "agreement",
		label: "View agreement",
		icon: ICONS.agreement,
		hotkey: "A",
		can: (person) => person.hasAgreement && !agreement.loading(),
		// The two reasons AgreementButton has always given, kept apart:
		// "there is none" and "one is on its way" are different answers.
		disabledReason: (person) =>
			person.hasAgreement ? "Opening…" : "No signed agreement on file",
		run: (person) => {
			agreement.open(person._id);
		},
	};
}
