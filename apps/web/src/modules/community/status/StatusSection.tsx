import { Button, Icon, PropertyRow, Status } from "@j-os/design-system";
import { For, Match, Show, Switch, type JSX } from "solid-js";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type {
	BoardTask,
	PersonStatus,
	StatusFact,
} from "../../../../convex/lib/derive.ts";
import { ICONS } from "../../../shared/icons.ts";
import { RoleSection } from "../drawers/RoleSection.tsx";
import { useOpenAgreement } from "../openAgreement.ts";

import { AccessUntilControl, canExtendWindow } from "./AccessUntilControl.tsx";
import { factLine, type FactLine } from "./copy.ts";
import { DoorOverrideControl } from "./DoorOverrideControl.tsx";
import styles from "./StatusSection.module.scss";

/**
 * One fact's value. `Status` is the wrapper that owns the colour: it sets
 * `data-status`, and the global rule remaps `--jf-status-fg` off it. An absent
 * tone falls to "neutral", which maps to the default foreground — so there is
 * no branch here and no second colour table to keep in step with the tokens.
 */
function StatusValue(props: { line: FactLine }): JSX.Element {
	return (
		<Status status={props.line.tone}>
			<span class={styles.value}>{props.line.value}</span>
		</Status>
	);
}

/**
 * The end of this person's window, if that is what this fact is.
 *
 * Returns a value rather than a boolean so `<Match keyed>` can hand the branch
 * something narrowed — the fact union is keyed on `id`, and a boolean guard
 * cannot carry that narrowing across the JSX boundary. Wrapped in an object
 * because `<Match>` tests its `when` for truthiness, and a bare `0` — an
 * `accessUntil` of the epoch, which the imports have already shown they can
 * produce — would read as "no match" and silently withhold the control.
 */
function accessAt(fact: StatusFact): { at: number } | undefined {
	return fact.id === "access_until" ? { at: fact.at } : undefined;
}

/**
 * The "Signed" value, as a way to read the thing that was signed.
 *
 * Only when it IS signed: "Not signed" and "Not required" have no document
 * behind them, so they stay plain text rather than offering a control that
 * would open a blank tab and close it again.
 *
 * The roster row already has this in its actions column; the drawer did not,
 * so the only way to see a member's agreement was to close the drawer and find
 * their row again.
 */
function AgreementValue(props: {
	line: FactLine;
	personId: Id<"people">;
}): JSX.Element {
	const agreement = useOpenAgreement();
	return (
		<Status status={props.line.tone}>
			<button
				type="button"
				class={styles.link}
				disabled={agreement.loading()}
				onClick={() => {
					agreement.open(props.personId);
				}}
			>
				{props.line.value}
			</button>
		</Status>
	);
}

/**
 * One fact's value: text, or the control that changes it.
 *
 * Two of these lines are board DECISIONS rather than consequences of one — the
 * door override and the end of a guest's window — so in edit mode they become
 * their controls. Everything else stays text: you change someone's role through
 * the role dialog, not by typing over the word "Member".
 */
function FactValue(props: {
	fact: StatusFact;
	person: Doc<"people">;
	editing?: boolean;
}): JSX.Element {
	function name(): string {
		return `${props.person.firstName} ${props.person.lastName}`.trim();
	}
	return (
		<Switch fallback={<StatusValue line={factLine(props.fact)} />}>
			<Match
				when={
					props.fact.id === "agreement" &&
					props.fact.state === "signed"
				}
			>
				<AgreementValue
					line={factLine(props.fact)}
					personId={props.person._id}
				/>
			</Match>
			{/* The role is a board decision like the two below it, so in edit
			    mode this line becomes its control rather than the section
			    growing a stray block underneath. An applicant is excluded: an
			    application is decided with the drawer's footer buttons, and the
			    chooser would offer destinations that skip them. */}
			<Match
				when={
					props.editing === true &&
					props.fact.id === "role" &&
					props.person.tier !== "prospect"
				}
			>
				<RoleSection person={props.person} />
			</Match>
			<Match when={props.editing === true && props.fact.id === "door"}>
				<DoorOverrideControl
					personId={props.person._id}
					value={props.person.door?.override ?? "none"}
					name={name()}
				/>
			</Match>
			<Match
				when={
					props.editing === true && canExtendWindow(props.person)
						? accessAt(props.fact)
						: undefined
				}
				keyed
			>
				{(access) => (
					<AccessUntilControl
						personId={props.person._id}
						value={access.at}
						accessUntilLocal={props.person.accessUntilLocal}
						name={name()}
					/>
				)}
			</Match>
		</Switch>
	);
}

/**
 * The drawer's Status section: one labelled line per fact, then whatever the
 * board still owes this person.
 *
 * Values are text, not badges. A row of pills gives every line a different
 * height and pushes the values off the baseline the labels sit on, which is
 * what made the previous version hard to read down. Colour is used sparingly —
 * only where a value is a problem — so it means something when it appears.
 *
 * Most lines are derived and cannot be edited: you change someone's role
 * through the role dialog, not by typing over the word "Member". The two
 * exceptions are the door override and a guest's access end date, which ARE
 * board decisions rather than consequences of one — `editing` swaps each of
 * those lines for its control (see {@link FactValue}).
 */
export function StatusSection(props: {
	status: PersonStatus;
	/** The person, for the lines that are editable rather than derived. */
	person: Doc<"people">;
	/** In edit mode the door and access-until lines become their controls. */
	editing?: boolean;
	/** Receives the board step ID, not its label — the handler dispatches it. */
	onCompleteBoardTask?: (stepId: BoardTask["id"]) => void;
}): JSX.Element {
	return (
		<div>
			<For each={props.status.facts}>
				{(fact) => {
					function line(): FactLine {
						return factLine(fact);
					}
					return (
						<PropertyRow icon={line().icon} label={line().label}>
							<FactValue
								fact={fact}
								person={props.person}
								editing={props.editing}
							/>
						</PropertyRow>
					);
				}}
			</For>
			<For each={props.status.boardTasks}>
				{(task) => (
					<PropertyRow icon="pending_actions" label="Board to do">
						<span class={styles.task}>
							<span>{task.label}</span>
							<Show when={props.onCompleteBoardTask}>
								{(complete) => (
									<Button
										variant="secondary"
										onClick={() => {
											// The ID, not the label. The handler
											// dispatches it straight through to
											// completeBoardStep.
											complete()(task.id);
										}}
									>
										<Icon>{ICONS.check}</Icon>
										Done
									</Button>
								)}
							</Show>
						</span>
					</PropertyRow>
				)}
			</For>
		</div>
	);
}
