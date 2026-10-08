import type { Doc } from "../../../../convex/_generated/dataModel";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";

import { useGuestExpiry } from "./guestExpiry.tsx";
import type { ActionDescriptor } from "./shortcuts.ts";
import { useTriage } from "./triage.ts";

/** Just enough of a person to decide on their application. */
export type Applicant = Pick<
	Doc<"people">,
	"_id" | "firstName" | "lastName" | "tier" | "stage"
>;

/**
 * The four decisions the board can take on an application, and whether each is
 * available.
 *
 * Shared by the roster row's icon buttons and the drawer's decision bar. The
 * confirms, the wording of them, and the fact that "Make guest" goes through
 * the expiry-and-door dialog rather than approving straight away all live here
 * — two copies would let the same button mean two different things depending on
 * where it was pressed.
 *
 * Availability comes from the machine (`legalEvents`), not from a guess about
 * tier and stage: the buttons light up exactly when the transition would be
 * accepted.
 */
export function useApplicationDecisions(): {
	can: (person: Applicant, action: Action) => boolean;
	makeGuest: (person: Applicant) => void;
	makeMember: (person: Applicant) => Promise<void>;
	turnDown: (person: Applicant) => Promise<void>;
	undeny: (person: Applicant) => void;
	actions: () => ActionDescriptor<Applicant>[];
} {
	const triage = useTriage();
	const requestGuestExpiry = useGuestExpiry();
	const confirm = useConfirm();

	function fullName(person: Applicant): string {
		return `${person.firstName} ${person.lastName}`.trim();
	}
	function events(person: Applicant): readonly string[] {
		return legalEvents(`${person.tier}.${person.stage}`);
	}

	const decisions = {
		can: (person: Applicant, action: Action) =>
			events(person).includes(EVENT_FOR[action]),

		// Not an approval on its own: a guest needs an access window, and since
		// today a door decision too. Both are asked for in the dialog.
		makeGuest: (person: Applicant) => {
			requestGuestExpiry([person._id]);
		},

		makeMember: async (person: Applicant) => {
			if (
				await confirm({
					title: "Make member?",
					message: `Approve ${fullName(person)} as a member? They'll be emailed an invite.`,
					confirmLabel: "Make member",
				})
			)
				await triage.makeMember(person._id);
		},

		turnDown: async (person: Applicant) => {
			if (
				await confirm({
					title: "Turn down application?",
					message: `Deny ${fullName(person)}'s application? They'll be emailed a rejection.`,
					confirmLabel: "Turn down",
					tone: "danger",
				})
			)
				await triage.deny(person._id);
		},

		// A mis-clicked Deny must be recoverable. No confirm: undoing a mistake
		// should not itself need a decision.
		undeny: (person: Applicant) => {
			void triage.undeny(person._id);
		},
	};

	function actions(): ActionDescriptor<Applicant>[] {
		return [
			{
				id: "guest",
				label: "Make guest",
				icon: ICONS.guestApplication,
				hotkey: "G",
				scope: "applications",
				can: (person) => decisions.can(person, "guest"),
				run: (person) => {
					decisions.makeGuest(person);
				},
			},
			{
				id: "member",
				label: "Make member",
				icon: ICONS.memberApplication,
				hotkey: "M",
				scope: "applications",
				can: (person) => decisions.can(person, "member"),
				run: (person) => decisions.makeMember(person),
			},
			{
				id: "deny",
				label: "Turn down",
				icon: ICONS.decline,
				// X, to match the close/✕ icon — a mnemonic the glyph already
				// teaches. (Not "D" for deny: the letter the eye sees is the ✕.)
				hotkey: "X",
				scope: "applications",
				can: (person) => decisions.can(person, "deny"),
				run: (person) => decisions.turnDown(person),
			},
			{
				id: "undeny",
				label: "Undo deny",
				icon: ICONS.undo,
				hotkey: "U",
				scope: "applications",
				can: (person) => decisions.can(person, "undeny"),
				run: (person) => {
					decisions.undeny(person);
				},
			},
		];
	}

	return { ...decisions, actions };
}

export type Action = "guest" | "member" | "deny" | "undeny";

/** The machine edge each decision travels, and so the one that decides whether
 *  it is on offer. */
const EVENT_FOR: Record<Action, string> = {
	guest: "APPROVE_GUEST",
	member: "APPROVE_MEMBER",
	deny: "DENY",
	undeny: "UNDENY",
};
