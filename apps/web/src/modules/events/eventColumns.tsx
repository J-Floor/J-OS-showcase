import type { JfColumnDef } from "@j-os/design-system";

import type { Doc } from "../../../convex/_generated/dataModel";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { actionsColumnSize } from "../community/columns/RowActions.tsx";

import { EventRowActions } from "./EventRowActions.tsx";

// The space is physically in SITE_TIMEZONE, so a travelling admin must see the
// event's Zurich date, not their browser's. Format the stored instant in that
// zone (matches the drawer, which renders the *Local wall-clock in the same zone).
const dateFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeZone: SITE_TIMEZONE,
});

/** An event date as the table shows it. */
export function formatEventDate(ms: number): string {
	return dateFormat.format(new Date(ms));
}

/** The three accordion buckets, in display order. Compared against the cached
 *  UTC epochs (`startsAt`/`endsAt`), which are zone-independent instants — so
 *  "current" means the event is physically happening now regardless of the
 *  admin's browser zone. */
const phaseOptions = [
	{ value: "future", label: "Future" },
	{ value: "current", label: "Current" },
	{ value: "past", label: "Past" },
] as const;

function eventPhase(event: Doc<"events">, now: number): string {
	if (now < event.startsAt) return "future";
	if (now > event.endsAt) return "past";
	return "current";
}

/**
 * Events table columns: name, start/end dates, and a trailing actions column
 * (copy link / download QR) mirroring the community roster's actions column —
 * `disableRowClick` so those buttons don't also open the drawer.
 */
export function eventColumns(): JfColumnDef<Doc<"events">>[] {
	// Captured once when the columns are built (Table reads config once at
	// setup). An event silently crossing future→current→past won't re-bucket
	// until the page reloads — fine for a board tool that refetches often, and
	// phase boundaries fall on the event's own start/end, not every tick.
	const now = Date.now();
	return [
		{
			// Hidden grouping column (`Table` hides whatever it groups by): the
			// derived phase must live in a column for `groupBy="phase"` to
			// resolve — it is not shown as a cell, only as the accordion header.
			id: "phase",
			header: "Phase",
			dataType: "enum",
			enumOptions: phaseOptions,
			accessorFn: (row) => eventPhase(row, now),
		},
		// The name takes what the dates leave; the dates are exactly as wide
		// as the longest date they show.
		{ accessorKey: "name", header: "Name", dataType: "string" },
		{
			accessorKey: "startsAt",
			header: "Starts",
			dataType: "date",
			size: "content",
			cell: (info) => formatEventDate(info.row.original.startsAt),
			measureText: (r) => formatEventDate(r.startsAt),
		},
		{
			accessorKey: "endsAt",
			header: "Ends",
			dataType: "date",
			size: "content",
			cell: (info) => formatEventDate(info.row.original.endsAt),
			measureText: (r) => formatEventDate(r.endsAt),
		},
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			size: actionsColumnSize(2),
			cell: (info) => <EventRowActions row={info.row.original} />,
		},
	];
}
