import type { Doc } from "../../../../convex/_generated/dataModel";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import type { EventType } from "../../../../convex/lib/lifecycleTypes.ts";
import { displayName } from "../../../../convex/lib/names.ts";
import type {
	ActionDescriptor,
	ActionOutcome,
} from "../../../shared/actions/shortcuts.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { ICONS } from "../../../shared/icons.ts";

import { useGuestExpiry } from "./guestExpiry.tsx";
import { settleRosterAction } from "./RosterActionError.tsx";
import { useTriage } from "./triage.ts";
import { useTriageBatch } from "./triageBatch.ts";

/** Just enough of a person to decide on their application. */
export type Applicant = Pick<
	Doc<"people">,
	"_id" | "firstName" | "lastName" | "tier" | "stage"
>;

type ApplicationDecisionHandlers = {
	can: (person: Applicant, action: Action) => boolean;
	makeGuest: (person: Applicant) => void;
	makeMember: (person: Applicant) => Promise<ActionOutcome>;
	turnDown: (person: Applicant) => Promise<ActionOutcome>;
	undeny: (person: Applicant) => Promise<ActionOutcome>;
	/** Each decision over checked rows: one prompt for all of them. */
	batch: {
		guest: (people: Applicant[]) => void;
	} & Record<
		Exclude<Action, "guest">,
		(people: Applicant[]) => Promise<ActionOutcome>
	>;
};

function events(person: Applicant): readonly EventType[] {
	return legalEvents(`${person.tier}.${person.stage}`);
}

function describeActions(
	decisions: ApplicationDecisionHandlers
): ActionDescriptor<Applicant>[] {
	return [
		{
			id: "guest",
			label: "Make guest",
			icon: ICONS.guestApplication,
			hotkey: "G",
			can: (person) => decisions.can(person, "guest"),
			run: (person) => {
				decisions.makeGuest(person);
			},
			runBatch: (people) => {
				decisions.batch.guest(people);
			},
		},
		{
			id: "member",
			label: "Make member",
			icon: ICONS.memberApplication,
			hotkey: "M",
			celebrate: true,
			can: (person) => decisions.can(person, "member"),
			run: (person) => decisions.makeMember(person),
			runBatch: decisions.batch.member,
		},
		{
			id: "deny",
			label: "Turn down",
			icon: ICONS.decline,
			// X, to match the close/✕ icon — a mnemonic the glyph already
			// teaches. (Not "D" for deny: the letter the eye sees is the ✕.)
			hotkey: "X",
			can: (person) => decisions.can(person, "deny"),
			run: (person) => decisions.turnDown(person),
			runBatch: decisions.batch.deny,
		},
		{
			id: "undeny",
			label: "Undo deny",
			icon: ICONS.undo,
			hotkey: "U",
			can: (person) => decisions.can(person, "undeny"),
			run: (person) => decisions.undeny(person),
			runBatch: decisions.batch.undeny,
		},
	];
}

/**
 * The four decisions the board can take on an application, and whether each is
 * available.
 *
 * Shared by the roster row's icon buttons and the sheet's decision bar. The
 * confirms, the wording of them, and the fact that "Make guest" goes through
 * the expiry-and-door dialog rather than approving straight away all live here
 * — two copies would let the same button mean two different things depending on
 * where it was pressed.
 *
 * Availability comes from the machine (`legalEvents`), not from a guess about
 * tier and stage: the buttons light up exactly when the transition would be
 * accepted.
 */
export function useApplicationDecisions(): ApplicationDecisionHandlers & {
	actions: () => ActionDescriptor<Applicant>[];
} {
	const triage = useTriage();
	const requestGuestExpiry = useGuestExpiry();
	const confirm = useConfirm();
	const runBatch = useTriageBatch("applications");

	const decisions = {
		can: (person: Applicant, action: Action) =>
			events(person).includes(EVENT_FOR[action]),

		// Not an approval on its own: a guest needs an access window, and since
		// today a door decision too. Both are asked for in the dialog.
		makeGuest: (person: Applicant) => {
			requestGuestExpiry([person._id]);
		},

		makeMember: async (person: Applicant): Promise<ActionOutcome> => {
			if (
				await confirm({
					title: "Make member?",
					message: `Approve ${displayName(person)} as a member? They'll be emailed an invite.`,
					confirmLabel: "Make member",
				})
			)
				return settleRosterAction(
					"applications",
					person._id,
					triage.makeMember(person._id)
				);
		},

		turnDown: async (person: Applicant): Promise<ActionOutcome> => {
			if (
				await confirm({
					title: "Turn down application?",
					message: `Deny ${displayName(person)}'s application? They'll be emailed a rejection.`,
					confirmLabel: "Turn down",
					tone: "danger",
				})
			)
				return settleRosterAction(
					"applications",
					person._id,
					triage.deny(person._id)
				);
		},

		// A mis-clicked Deny must be recoverable. No confirm: undoing a mistake
		// should not itself need a decision.
		undeny: (person: Applicant) =>
			settleRosterAction(
				"applications",
				person._id,
				triage.undeny(person._id)
			),

		batch: {
			// The expiry dialog asks for every applicant at once; it leaves
			// the selection as it was.
			guest: (people: Applicant[]) => {
				requestGuestExpiry(people.map((person) => person._id));
			},
			member: (people: Applicant[]) =>
				runBatch(people, triage.makeMember, {
					title: "Make members?",
					message: `Approve ${String(people.length)} applicant(s) as members? They'll each be emailed an invite.`,
					confirmLabel: "Make members",
				}),
			deny: (people: Applicant[]) =>
				runBatch(people, triage.deny, {
					title: "Turn down applications?",
					message: `Deny ${String(people.length)} application(s)? Each applicant will be emailed a rejection.`,
					confirmLabel: "Turn down",
					tone: "danger",
				}),
			undeny: (people: Applicant[]) => runBatch(people, triage.undeny),
		},
	};

	// Built once: the key and the footer button must hold the same objects,
	// or the run guard (`runAction`) cannot tell they are one action.
	const actions = describeActions(decisions);
	return { ...decisions, actions: () => actions };
}

type Action = "guest" | "member" | "deny" | "undeny";

/** The machine edge each decision travels, and so the one that decides whether
 *  it is on offer. */
const EVENT_FOR: Record<Action, EventType> = {
	guest: "APPROVE_GUEST",
	member: "APPROVE_MEMBER",
	deny: "DENY",
	undeny: "UNDENY",
};
