import { Button, Icon, isTypingTarget, Table } from "@j-os/design-system";
import {
	createHotkey,
	createHotkeys,
	type Hotkey,
} from "@tanstack/solid-hotkeys";
import { useMutation } from "convex-solidjs";
import { type Accessor, type JSX, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import type { EventType } from "../../../../convex/lib/lifecycleTypes.ts";
import type { PersonRow } from "../../../../convex/people.ts";
import { call } from "../../../lib/call.ts";
import { type ConfirmOptions, useConfirm } from "../../../shared/confirm.tsx";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { useApplicationDecisions } from "../actions/applicationDecisions.ts";
import {
	GuestExpiryProvider,
	useGuestExpiry,
} from "../actions/guestExpiry.tsx";
import { settleRosterAction } from "../actions/RosterActionError.tsx";
import {
	type Triage,
	type TriageResult,
	useTriage,
} from "../actions/triage.ts";
import {
	applicationColumns,
	CurrentPersonContext,
} from "../columns/applicationColumns.tsx";
import { useApplications } from "../data/communityData.tsx";
import { ScoreField } from "../sheets/ScoreField.tsx";

import { RosterTab, useRosterBatch } from "./RosterTab.tsx";
import type { TabProps } from "./TabProps.ts";

/** The digit keys that set a score straight from the roster. 0–9 only — one
 *  keypress, one value; the two-digit 10 and 11 stay reachable through the score
 *  cell. Typed as `Hotkey` constants (the library rejects a bare string). */
const DIGIT_KEYS = [
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9",
] as const satisfies readonly Hotkey[];

/**
 * Applications tab: the pipeline as one grouped roster — `To score`, `Queue`,
 * `Denied` — with batch triage (deny / make guest / make member / undo).
 *
 * The roster + sheet scaffold is {@link RosterTab}; this file owns what is
 * application-specific: the decision descriptors, the selection bar and the
 * row keys. The {@link ApplicationsSheetProvider} (the make-guest expiry
 * dialog and the "current person" the score cells read) wraps the whole tab so
 * the row cells and the selection bar can both open the expiry dialog.
 */
export function ApplicationsTab(props: TabProps): JSX.Element {
	return (
		<ApplicationsSheetProvider>
			<ApplicationsRoster {...props} />
		</ApplicationsSheetProvider>
	);
}

/** The selected rows an event is legal for: each batch action runs only on
 *  those (denied applications are terminal). */
function rowsAllowing(rows: PersonRow[], event: EventType): PersonRow[] {
	return rows.filter((row) =>
		legalEvents(`${row.tier}.${row.stage}`).includes(event)
	);
}

/** Runs a per-row action over `rows`, then clears the selection — after the
 *  user agrees to `prompt` when there is one. */
function useBatchRunner() {
	const confirm = useConfirm();
	const runBatch = useRosterBatch();
	const selection = Table.useSelection<PersonRow>();
	return function runBatchAfter(
		prompt: ConfirmOptions | undefined,
		rows: PersonRow[],
		action: (id: PersonRow["_id"]) => TriageResult
	): void {
		void (async () => {
			if (prompt !== undefined && !(await confirm(prompt))) return;
			await runBatch(rows, action, selection.clear);
		})();
	};
}

function MakeGuestButton(props: { rows: PersonRow[] }): JSX.Element {
	const requestGuestExpiry = useGuestExpiry();
	return (
		<Button
			variant="secondary"
			onClick={() => {
				requestGuestExpiry(props.rows.map((row) => row._id));
			}}
		>
			<Icon>{ICONS.guestApplication}</Icon>Make guest
		</Button>
	);
}

/** A selection-bar button that runs one triage decision over `rows`, after
 *  the user agrees to `prompt` (built from the row count at click time) when
 *  there is one. Its children are the button's icon and label. */
function BatchDecisionButton(props: {
	rows: PersonRow[];
	prompt?: (count: number) => ConfirmOptions;
	decide: (triage: Triage) => (id: PersonRow["_id"]) => TriageResult;
	children: JSX.Element;
}): JSX.Element {
	const triage = useTriage();
	const runBatchAfter = useBatchRunner();
	return (
		<Button
			variant="secondary"
			onClick={() => {
				const rows = props.rows;
				runBatchAfter(
					props.prompt?.(rows.length),
					rows,
					props.decide(triage)
				);
			}}
		>
			{props.children}
		</Button>
	);
}

/**
 * The selection bar's buttons. Each hides when none of the selection qualifies
 * for it.
 */
function ApplicationBatchActions(): JSX.Element {
	const selection = Table.useSelection<PersonRow>();
	function guestable() {
		return rowsAllowing(selection.rows(), "APPROVE_GUEST");
	}
	function memberable() {
		return rowsAllowing(selection.rows(), "APPROVE_MEMBER");
	}
	function deniable() {
		return rowsAllowing(selection.rows(), "DENY");
	}
	function undeniable() {
		return rowsAllowing(selection.rows(), "UNDENY");
	}

	return (
		<>
			<Show when={guestable().length > 0}>
				<MakeGuestButton rows={guestable()} />
			</Show>
			<Show when={memberable().length > 0}>
				<BatchDecisionButton
					rows={memberable()}
					prompt={(count) => ({
						title: "Make members?",
						message: `Approve ${String(count)} applicant(s) as members? They'll each be emailed an invite.`,
						confirmLabel: "Make members",
					})}
					decide={(triage) => triage.makeMember}
				>
					<Icon>{ICONS.memberApplication}</Icon>Make member
				</BatchDecisionButton>
			</Show>
			<Show when={deniable().length > 0}>
				<BatchDecisionButton
					rows={deniable()}
					prompt={(count) => ({
						title: "Turn down applications?",
						message: `Deny ${String(count)} application(s)? Each applicant will be emailed a rejection.`,
						confirmLabel: "Turn down",
						tone: "danger",
					})}
					decide={(triage) => triage.deny}
				>
					<Icon>{ICONS.decline}</Icon>Turn down
				</BatchDecisionButton>
			</Show>
			<Show when={undeniable().length > 0}>
				<BatchDecisionButton
					rows={undeniable()}
					decide={(triage) => triage.undeny}
				>
					<Icon>{ICONS.undo}</Icon>Undo deny
				</BatchDecisionButton>
			</Show>
		</>
	);
}

/**
 * 0–9 set the ringed applicant's score outright (the score is shared, so a
 * digit overwrites it, same as the cell). Inert unless a row is ringed — no
 * sheet, no selection, this tab on screen — because `focused()` is `undefined`
 * otherwise. `n` drops focus into the ringed row's note composer; only the live
 * table has a `data-focused` row, so the document query resolves to the right
 * one.
 */
function useApplicationRowKeys(
	focused: () => PersonRow | undefined,
	setScore: ReturnType<typeof useMutation<typeof api.applications.setScore>>
): void {
	createHotkeys(
		() =>
			DIGIT_KEYS.map((digit) => ({
				hotkey: digit,
				callback: (event: KeyboardEvent) => {
					if (event.repeat || isTypingTarget(event.target)) return;
					const row = focused();
					if (!row) return;
					event.preventDefault();
					void settleRosterAction(
						"applications",
						row._id,
						call(
							setScore.mutateAsync({
								personId: row._id,
								value: Number(digit),
							}),
							"Could not save the score."
						)
					);
				},
			})),
		() => ({ ignoreInputs: false, preventDefault: false })
	);
	createHotkey(
		"N",
		(event) => {
			if (event.repeat || isTypingTarget(event.target) || !focused())
				return;
			const input = document.querySelector<HTMLInputElement>(
				'tr[data-focused="true"] [data-note-cell] input'
			);
			if (!input) return;
			event.preventDefault();
			input.focus();
		},
		() => ({ ignoreInputs: false, preventDefault: false })
	);
}

/** The sheet's score field reads who is signed in; the tab's score cells
 *  read the same. */
function CurrentPersonProvider(props: { children: JSX.Element }): JSX.Element {
	const currentPerson = useQuery(api.people.getCurrentPerson, {});
	return (
		<CurrentPersonContext.Provider value={currentPerson.data}>
			{props.children}
		</CurrentPersonContext.Provider>
	);
}

/** Everything the Applications sheet needs around it: the make-guest expiry
 *  dialog and the signed-in person. The tab and the peek both sit inside it. */
export function ApplicationsSheetProvider(props: {
	children: JSX.Element;
}): JSX.Element {
	return (
		<GuestExpiryProvider>
			<CurrentPersonProvider>{props.children}</CurrentPersonProvider>
		</GuestExpiryProvider>
	);
}

/**
 * The Applications sheet's own setup, shared by the tab and the peek: the
 * decision descriptors (footer buttons and action keys), the score field
 * above them and the digit keys that score the person the sheet shows. Call
 * it inside an {@link ApplicationsSheetProvider}.
 */
export function useApplicationsSheet() {
	const setScore = useMutation(api.applications.setScore);
	const decisions = useApplicationDecisions();
	return {
		scope: "applications",
		actions: decisions.actions,
		footerLead: (person: Accessor<PersonRow>) => (
			<ScoreField person={person()} />
		),
		focusedRowKeys: (focused: () => PersonRow | undefined) => {
			useApplicationRowKeys(focused, setScore);
		},
	} as const;
}

function ApplicationsRoster(props: TabProps): JSX.Element {
	const applications = useApplications();
	const sheet = useApplicationsSheet();

	return (
		<RosterTab.Root<PersonRow>
			tab={props}
			scope={sheet.scope}
			data={() => applications.data()}
			columns={() => applicationColumns()}
			groupBy="triageGroup"
			// Score first, date as the tie-break: the scored "Queue" group
			// orders by score descending, while every row in "To score" scores
			// equal (unscored reads as 0) and falls through to newest first.
			initialColumnSorting={[
				{ id: "score", desc: true },
				{ id: "createdAt", desc: true },
			]}
			actions={sheet.actions}
			footerLead={sheet.footerLead}
			focusedRowKeys={sheet.focusedRowKeys}
		>
			<Table.BatchActions>
				<ApplicationBatchActions />
			</Table.BatchActions>
		</RosterTab.Root>
	);
}
