import { Button, Icon, isTypingTarget } from "@j-os/design-system";
import {
	createHotkey,
	createHotkeys,
	type Hotkey,
} from "@tanstack/solid-hotkeys";
import { useMutation, useQuery } from "convex-solidjs";
import { type JSX, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import { legalEvents } from "../../../../convex/lib/lifecycle.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
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

import { RosterTab } from "./RosterTab.tsx";
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

function ApplicationsRoster(props: TabProps): JSX.Element {
	const applications = useApplications();
	const currentPerson = useQuery(
		api.people.getCurrentPerson,
		{},
		{ keepPreviousData: true }
	);
	const triage = useTriage();
	const requestGuestExpiry = useGuestExpiry();
	const confirm = useConfirm();
	const setScore = useMutation(api.applications.setScore);
	// Read only for its `.actions()` descriptors — the selection bar below still
	// goes through `triage`/`confirm`/`requestGuestExpiry` directly.
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
					// 0–9 set the ringed applicant's score outright (the score is
					// shared, so a digit overwrites it, same as the cell). Inert
					// unless a row is ringed — no drawer, no selection, this tab on
					// screen — because `focused()` is `undefined` otherwise.
					createHotkeys(
						() =>
							DIGIT_KEYS.map((digit) => ({
								hotkey: digit,
								callback: (event: KeyboardEvent) => {
									if (
										event.repeat ||
										isTypingTarget(event.target)
									)
										return;
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
					// `n` drops focus into the ringed row's note composer. Only the
					// live table has a `data-focused` row, so the document query
					// resolves to the right one.
					createHotkey(
						"N",
						(event) => {
							if (
								event.repeat ||
								isTypingTarget(event.target) ||
								!focused()
							)
								return;
							const input =
								document.querySelector<HTMLInputElement>(
									'tr[data-focused="true"] [data-note-cell] input'
								);
							if (!input) return;
							event.preventDefault();
							input.focus();
						},
						() => ({ ignoreInputs: false, preventDefault: false })
					);
				}}
				batchActions={(p) => {
					// Each action runs only on the selected rows it is legal for
					// (denied applications are terminal); the button hides when none
					// of the selection qualifies.
					function eventsFor(r: ApplicationRow) {
						return legalEvents(`${r.tier}.${r.stage}`);
					}
					function deniable() {
						return p.selectedRows.filter((r) =>
							eventsFor(r).includes("DENY")
						);
					}
					function guestable() {
						return p.selectedRows.filter((r) =>
							eventsFor(r).includes("APPROVE_GUEST")
						);
					}
					function memberable() {
						return p.selectedRows.filter((r) =>
							eventsFor(r).includes("APPROVE_MEMBER")
						);
					}
					function undeniable() {
						return p.selectedRows.filter((r) =>
							eventsFor(r).includes("UNDENY")
						);
					}
					return (
						<>
							<Show when={guestable().length > 0}>
								<Button
									variant="secondary"
									onClick={() => {
										requestGuestExpiry(
											guestable().map((r) => r._id)
										);
									}}
								>
									<Icon>{ICONS.guestApplication}</Icon>Make
									guest
								</Button>
							</Show>
							<Show when={memberable().length > 0}>
								<Button
									variant="secondary"
									onClick={() => {
										void (async () => {
											const rows = memberable();
											if (
												await confirm({
													title: "Make members?",
													message: `Approve ${rows.length} applicant(s) as members? They'll each be emailed an invite.`,
													confirmLabel:
														"Make members",
												})
											)
												await p.runBatch(
													rows,
													triage.makeMember,
													p.clearSelection
												);
										})();
									}}
								>
									<Icon>{ICONS.memberApplication}</Icon>Make
									member
								</Button>
							</Show>
							<Show when={deniable().length > 0}>
								<Button
									variant="secondary"
									onClick={() => {
										void (async () => {
											const rows = deniable();
											if (
												await confirm({
													title: "Turn down applications?",
													message: `Deny ${rows.length} application(s)? Each applicant will be emailed a rejection.`,
													confirmLabel: "Turn down",
													tone: "danger",
												})
											)
												await p.runBatch(
													rows,
													triage.deny,
													p.clearSelection
												);
										})();
									}}
								>
									<Icon>{ICONS.decline}</Icon>Turn down
								</Button>
							</Show>
							<Show when={undeniable().length > 0}>
								<Button
									variant="secondary"
									onClick={() => {
										void (async () => {
											await p.runBatch(
												undeniable(),
												triage.undeny,
												p.clearSelection
											);
										})();
									}}
								>
									<Icon>{ICONS.undo}</Icon>Undo deny
								</Button>
							</Show>
						</>
					);
				}}
			/>
		</CurrentPersonContext.Provider>
	);
}
