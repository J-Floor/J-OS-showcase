import {
	Confetti,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";
import { For } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { SHORT_TEXT_SIZE } from "../../../shared/columnSizes.ts";
import { formatDistance } from "../../../shared/time.ts";
import { useGuestActions } from "../actions/guestActions.ts";
import { personFields } from "../fields.ts";

import { NotesCell } from "./applicationColumns.tsx";
import { flagsColumn } from "./flagsColumn.tsx";
import { hostValue, type HostOption } from "./hostOptions.ts";
import { HostSelectCell } from "./HostSelectCell.tsx";
import { joinedColumn } from "./joinedColumn.ts";
import {
	actionsColumnSize,
	RowActionButton,
	RowActions,
} from "./RowActions.tsx";
import { ventureColumns } from "./ventureColumns.tsx";

export type GuestRow = Doc<"people"> & {
	status: PersonStatus;
	hasAgreement: boolean;
};

/** Guests tab grouping, straight off the machine's stage. A guest who left of
 *  their own accord is filed as alumni, not as someone who was thrown out —
 *  see `memberGroup`. */
export function guestStatus(
	row: GuestRow
): "active" | "expired" | "not_onboarded" | "alumni" | "kicked_out" {
	if (row.tier === "former")
		return row.formerReason === "left" ? "alumni" : "kicked_out";
	if (row.stage === "onboarding") return "not_onboarded";
	return row.stage === "expired" ? "expired" : "active";
}

const GUEST_ACTION_COUNT = 3;

const statusOptions = [
	{ value: "active", label: "Current" },
	{ value: "not_onboarded", label: "Never onboarded" },
	{ value: "expired", label: "Expired" },
	{ value: "alumni", label: "Alumni" },
	{ value: "kicked_out", label: "Kicked out" },
] as const;

/**
 * Per-row actions for the Guests tab: upgrade to member / kick out / view
 * agreement. Labels, icons, availability and key bindings all come from
 * `useGuestActions`, shared with the batch bar and the sheet footer — this
 * component just renders whatever it offers, in one consistent order with the
 * Members tab.
 */
function GuestActions(props: { row: GuestRow }) {
	const guestActions = useGuestActions();
	return (
		<RowActions>
			<For each={guestActions.actions()}>
				{(action) => {
					const button = (
						<RowActionButton action={action} row={props.row} />
					);
					return action.id === "member" ? (
						<Confetti>{button}</Confetti>
					) : (
						button
					);
				}}
			</For>
		</RowActions>
	);
}

/** What the "Time remaining" cell shows: the time left on the guest's
 *  access, or a dash when it has no end. */
function timeRemainingText(row: GuestRow): string {
	return row.accessUntil ? formatDistance(row.accessUntil) : "—";
}

/**
 * Guest table columns.
 *
 * A FACTORY, not a constant, because "Hosted by" is an enum whose options are
 * the current board — a fact that only exists at runtime. The alternative is
 * what it was: a free-text column whose filter offered a text box for a field
 * that can only ever hold one of six people, so filtering to a host meant
 * typing their name exactly and getting nothing when you typed the surname.
 *
 * `hosts` costs the caller a `useBoardLevel()` it already holds.
 */
export function guestColumns(
	hosts: readonly HostOption[]
): JfColumnDefinition<GuestRow>[] {
	return [
		{
			// Hidden grouping column — active above expired (group order from
			// `enumOptions`).
			id: "guestStatus",
			header: "Status",
			dataType: "enum",
			enumOptions: statusOptions,
			accessorFn: (row) => guestStatus(row),
		},
		fieldColumn(personFields.firstName, {
			accessorKey: "firstName",
			dataType: "string",
		}),
		fieldColumn(personFields.lastName, {
			accessorKey: "lastName",
			dataType: "string",
		}),
		flagsColumn<GuestRow>(),
		fieldColumn(personFields.timeRemaining, {
			dataType: "number",
			size: "content",
			// Coalesce to 0 so the accessor's value type is `number` (keeps the
			// JfColumnDefinition generics happy); the cell branches on the raw field.
			accessorFn: (row) => row.accessUntil ?? 0,
			cell: (info) => timeRemainingText(info.row.original),
			measureText: timeRemainingText,
			measureVolatile: true,
		}),
		fieldColumn(personFields.ventureName, {
			dataType: "string",
			size: SHORT_TEXT_SIZE,
			measureText: false,
			accessorFn: (row) => row.venture?.name ?? "",
		}),
		fieldColumn(personFields.hostedById, {
			// Editable: the board member who vouches for this guest. Inline-editable
			// by any board member; click is kept on the cell (not the row) so editing
			// doesn't open the detail sheet.
			//
			// Filters on the host's ID, not their name. The cell renders the name, so
			// a rename never breaks a saved filter — and the legacy `hostedBy` string
			// (imported rows whose host was never resolved) falls into an
			// "Unresolved" bucket rather than dragging every unresolved name into the
			// option list one at a time.
			dataType: "enum",
			enumOptions: hosts,
			disableRowClick: true,
			size: 180,
			accessorFn: (row) => hostValue(row),
			cell: (info) => <HostSelectCell row={info.row.original} />,
		}),
		...ventureColumns<GuestRow>(),
		fieldColumn(personFields.notes, {
			// The board's attributed notes thread (shared with the other tabs). The
			// Guests tab doesn't bind the `n` shortcut, so no peek chip is shown.
			dataType: "string",
			disableRowClick: true,
			size: { min: 240, weight: 2 },
			measureText: false,
			// Sort/filter on the latest note's text — what the cell shows.
			accessorFn: (row) => row.board?.noteLog?.at(-1)?.text ?? "",
			cell: (info) => (
				<NotesCell row={info.row.original} showShortcutHint={false} />
			),
		}),
		joinedColumn<GuestRow>(),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			// The agreement, upgrade to member, and kick out.
			size: actionsColumnSize(GUEST_ACTION_COUNT),
			cell: (info) => <GuestActions row={info.row.original} />,
		},
	];
}
