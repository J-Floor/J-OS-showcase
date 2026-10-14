import { Button, Icon, isTypingTarget } from "@j-os/design-system";
import {
	createHotkey,
	createHotkeys,
	type Hotkey,
} from "@tanstack/solid-hotkeys";
import { useMutation } from "convex-solidjs";
import { type JSX, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import type { EventType } from "../../../../convex/lib/lifecycleTypes.ts";
import { type ConfirmOptions, useConfirm } from "../../../shared/confirm.tsx";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { useApplicationDecisions } from "../actions/applicationDecisions.ts";
import {
	GuestExpiryProvider,
	useGuestExpiry,
} from "../actions/guestExpiry.tsx";
import { useTriage } from "../actions/triage.ts";
import {
	applicationColumns,
	CurrentPersonContext,
	type ApplicationRow,
} from "../columns/applicationColumns.tsx";
import { useApplications } from "../data/useApplications.ts";
import { ScoreField } from "../drawers/ScoreField.tsx";

import { RosterTab, type RosterBatchProps } from "./RosterTab.tsx";
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
 * The roster + drawer scaffold is {@link RosterTab}; this file owns what is
 * application-specific: the make-guest expiry dialog provider, the "current
 * person" context its cells read, the decision descriptors, and the selection
 * bar. The `GuestExpiryProvider` wraps the whole tab so the row cells and the
 * selection bar can both open the expiry dialog.
 */
export function ApplicationsTab(props: TabProps): JSX.Element {
	return (
		<GuestExpiryProvider>
			<ApplicationsRoster {...props} />
		</GuestExpiryProvider>
	);
}

/** The selected rows an event is legal for: each batch action runs only on
 *  those (denied applications are terminal). */
function rowsAllowing(
	rows: ApplicationRow[],
	event: EventType
): ApplicationRow[] {
	return rows.filter((row) =>
		legalEvents(`${row.tier}.${row.stage}`).includes(event)
	);
}

type ApplicationBatch = RosterBatchProps<ApplicationRow>;

/** Runs a per-row action over `rows`, then clears the selection — after the
 *  user agrees to `prompt` when there is one. */
function useBatchRunner(batch: () => ApplicationBatch) {
	const confirm = useConfirm();
	return function runBatchAfter(
		prompt: ConfirmOptions | undefined,
		rows: ApplicationRow[],
		action: (id: ApplicationRow["_id"]) => Promise<unknown>
	): void {
		void (async () => {
			if (prompt !== undefined && !(await confirm(prompt))) return;
			const { runBatch, clearSelection } = batch();
			await runBatch(rows, action, clearSelection);
		})();
	};
}

function MakeGuestButton(props: { rows: ApplicationRow[] }): JSX.Element {
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
 *  there is one. */
function BatchDecisionButton(props: {
	batch: ApplicationBatch;
	rows: ApplicationRow[];
	icon: string;
	label: string;
	prompt?: (count: number) => ConfirmOptions;
	decide: (
		triage: ReturnType<typeof useTriage>
	) => (id: ApplicationRow["_id"]) => Promise<unknown>;
}): JSX.Element {
	const triage = useTriage();
	const runBatchAfter = useBatchRunner(() => props.batch);
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
			<Icon>{props.icon}</Icon>
			{props.label}
		</Button>
	);
}

/**
 * The selection bar's buttons. Each hides when none of the selection qualifies
 * for it.
 */
function ApplicationBatchActions(props: {
	batch: ApplicationBatch;
}): JSX.Element {
	function guestable() {
		return rowsAllowing(props.batch.selectedRows, "APPROVE_GUEST");
	}
	function memberable() {
		return rowsAllowing(props.batch.selectedRows, "APPROVE_MEMBER");
	}
	function deniable() {
		return rowsAllowing(props.batch.selectedRows, "DENY");
	}
	function undeniable() {
		return rowsAllowing(props.batch.selectedRows, "UNDENY");
	}

	return (
		<>
			<Show when={guestable().length > 0}>
				<MakeGuestButton rows={guestable()} />
			</Show>
			<Show when={memberable().length > 0}>
				<BatchDecisionButton
					batch={props.batch}
					rows={memberable()}
					icon={ICONS.memberApplication}
					label="Make member"
					prompt={(count) => ({
						title: "Make members?",
						message: `Approve ${count} applicant(s) as members? They'll each be emailed an invite.`,
						confirmLabel: "Make members",
					})}
					decide={(triage) => triage.makeMember}
				/>
			</Show>
			<Show when={deniable().length > 0}>
				<BatchDecisionButton
					batch={props.batch}
					rows={deniable()}
					icon={ICONS.decline}
					label="Turn down"
					prompt={(count) => ({
						title: "Turn down applications?",
						message: `Deny ${count} application(s)? Each applicant will be emailed a rejection.`,
						confirmLabel: "Turn down",
						tone: "danger",
					})}
					decide={(triage) => triage.deny}
				/>
			</Show>
			<Show when={undeniable().length > 0}>
				<BatchDecisionButton
					batch={props.batch}
					rows={undeniable()}
					icon={ICONS.undo}
					label="Undo deny"
					decide={(triage) => triage.undeny}
				/>
			</Show>
		</>
	);
}

/**
 * 0–9 set the ringed applicant's score outright (the score is shared, so a
 * digit overwrites it, same as the cell). Inert unless a row is ringed — no
 * drawer, no selection, this tab on screen — because `focused()` is `undefined`
 * otherwise. `n` drops focus into the ringed row's note composer; only the live
 * table has a `data-focused` row, so the document query resolves to the right
 * one.
 */
function useApplicationRowKeys(
	focused: () => ApplicationRow | undefined,
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
					void setScore.mutateAsync({
						personId: row._id,
						value: Number(digit),
					});
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

function ApplicationsRoster(props: TabProps): JSX.Element {
	const applications = useApplications();
	const currentPerson = useQuery(api.people.getCurrentPerson, {});
	const setScore = useMutation(api.applications.setScore);
	// Read only for its `.actions()` descriptors — the selection bar goes
	// through `triage`/`confirm`/`requestGuestExpiry` directly.
	const decisions = useApplicationDecisions();

	return (
		<CurrentPersonContext.Provider value={currentPerson.data}>
			<RosterTab<ApplicationRow>
				tab={props}
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
				actions={decisions.actions}
				footerLead={(person) => <ScoreField person={person} />}
				focusedRowKeys={(focused) => {
					useApplicationRowKeys(focused, setScore);
				}}
				batchActions={(batch) => (
					<ApplicationBatchActions batch={batch} />
				)}
			/>
		</CurrentPersonContext.Provider>
	);
}
