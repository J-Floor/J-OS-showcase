import type { JfColumnDefinition } from "@j-os/design-system";

import { SITE_TIMEZONE } from "../../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { SHORT_TEXT_SIZE } from "../../../shared/columnSizes.ts";
import { formatDateIn, formatMonthIn } from "../../../shared/time.ts";
import { PERK_REQUEST_STATUS_OPTIONS } from "../perkOptions.ts";
import { PerkRequestStatusSelect } from "../PerkRequestStatusSelect.tsx";

import styles from "./requestColumns.module.scss";

export type RequestGrouping = "status" | "perk" | "requester" | "month";

/** The group-by switch's options, in the order it shows them. */
export const REQUEST_GROUPINGS: readonly {
	value: RequestGrouping;
	label: string;
}[] = [
	{ value: "status", label: "Status" },
	{ value: "perk", label: "Perk" },
	{ value: "requester", label: "Requester" },
	{ value: "month", label: "Month" },
];

/** The hidden column the table groups by; its value heads each group. */
export const REQUEST_GROUP_COLUMN = "group";

const STATUS_COLUMN_WIDTH = 180;

function perkLabel(row: PerkRequestRow): string {
	return `${row.partner} · ${row.perkTitle}`;
}

type TextRow = { original: PerkRequestRow };

/** Alphabetical the way a reader means it: "acme" sits beside "Acme", not
 *  after "Zeta". */
function byLabel(
	label: (row: PerkRequestRow) => string
): (rowA: TextRow, rowB: TextRow) => number {
	return (rowA, rowB) =>
		label(rowA.original).localeCompare(label(rowB.original));
}

function requesterLabel(row: PerkRequestRow): string {
	return row.requesterName;
}

/** The hidden group column for each grouping. A status group is an enum, so
 *  it keeps the order a request moves in whatever the sort. Perk and
 *  requester groups key on the id, so two people who share a name stay two
 *  groups, and read and sort by the name their header shows. */
const GROUP_COLUMNS: Record<
	RequestGrouping,
	JfColumnDefinition<PerkRequestRow>
> = {
	status: {
		id: REQUEST_GROUP_COLUMN,
		header: "Status",
		dataType: "enum",
		enumOptions: PERK_REQUEST_STATUS_OPTIONS,
		accessorFn: (row) => row.status,
	},
	perk: {
		id: REQUEST_GROUP_COLUMN,
		header: "Perk",
		dataType: "string",
		accessorFn: (row) => row.perkId,
		groupLabel: perkLabel,
		sortingFn: byLabel(perkLabel),
	},
	requester: {
		id: REQUEST_GROUP_COLUMN,
		header: "Requester",
		dataType: "string",
		accessorFn: (row) => row.personId,
		groupLabel: requesterLabel,
		sortingFn: byLabel(requesterLabel),
	},
	month: {
		id: REQUEST_GROUP_COLUMN,
		header: "Month",
		dataType: "string",
		accessorFn: (row) => formatMonthIn(row.requestedAt, SITE_TIMEZONE),
	},
};

/** What every grouping shows: who asked for what and when, then the status
 *  to move along in place. */
const VISIBLE_COLUMNS: JfColumnDefinition<PerkRequestRow>[] = [
	{ accessorKey: "requesterName", header: "Requester", dataType: "string" },
	{
		id: "venture",
		header: "Venture",
		dataType: "string",
		size: SHORT_TEXT_SIZE,
		measureText: false,
		accessorFn: (row) => row.ventureName ?? "",
	},
	{ id: "perk", header: "Perk", dataType: "string", accessorFn: perkLabel },
	{
		id: "contact",
		header: "Contact",
		dataType: "string",
		accessorFn: (row) => row.contactName ?? "",
	},
	{
		accessorKey: "requestedAt",
		header: "Requested",
		dataType: "date",
		size: "content",
		cell: (info) =>
			formatDateIn(info.row.original.requestedAt, SITE_TIMEZONE),
		measureText: (row) => formatDateIn(row.requestedAt, SITE_TIMEZONE),
	},
	{
		id: "note",
		header: "Note",
		dataType: "string",
		size: SHORT_TEXT_SIZE,
		measureText: false,
		accessorFn: (row) => row.note ?? "",
		cell: (info) => (
			<span class={styles.note}>{info.row.original.note ?? ""}</span>
		),
	},
	{
		accessorKey: "status",
		header: "Status",
		dataType: "enum",
		enumOptions: PERK_REQUEST_STATUS_OPTIONS,
		// The select edits the request where it is: a click on it must not
		// also open the perk.
		disableRowClick: true,
		size: STATUS_COLUMN_WIDTH,
		measureText: false,
		cell: (info) => (
			<PerkRequestStatusSelect
				requestId={info.row.original._id}
				status={info.row.original.status}
			/>
		),
	},
];

/** The Requests tab's columns for one grouping: the hidden group column,
 *  then the same visible columns in every mode. */
export function requestColumns(
	grouping: RequestGrouping
): JfColumnDefinition<PerkRequestRow>[] {
	return [GROUP_COLUMNS[grouping], ...VISIBLE_COLUMNS];
}

const NEWEST_FIRST = { id: "requestedAt", desc: true };

/** The table's opening sort, which also orders the groups: outside an enum,
 *  groups come in the order the sorted rows first reach them. Newest first
 *  already puts months newest first. Perks and requesters sort by name
 *  first, then newest first within each. */
export function requestSorting(
	grouping: RequestGrouping
): { id: string; desc: boolean }[] {
	return grouping === "perk" || grouping === "requester"
		? [{ id: REQUEST_GROUP_COLUMN, desc: false }, NEWEST_FIRST]
		: [NEWEST_FIRST];
}
