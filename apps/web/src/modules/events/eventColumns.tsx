import {
	actionsColumnSize,
	fieldColumn,
	type JfColumnDefinition,
} from "@j-os/design-system";

import type { Doc } from "../../../convex/_generated/dataModel";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { formatDateIn } from "../../shared/time.ts";

import { EventRowActions } from "./EventRowActions.tsx";
import { eventFields } from "./fields.ts";

const EVENT_ACTION_COUNT = 2;

/** The three accordion buckets, in display order. Compared against the cached
 *  UTC epochs (`startsAt`/`endsAt`), which are zone-independent instants — so
 *  "current" means the event is physically happening now regardless of the
 *  admin's browser zone. */
const phaseOptions = [
	{ value: "future", label: "Future" },
	{ value: "current", label: "Current" },
	{ value: "past", label: "Past" },
] as const;

type EventPhase = (typeof phaseOptions)[number]["value"];

function eventPhase(event: Doc<"events">, now: number): EventPhase {
	if (now < event.startsAt) return "future";
	return now > event.endsAt ? "past" : "current";
}

/** Newest first, in every phase group: the groups render over the one sorted
 *  row model, so a sort orders the rows within each group. Applied as the
 *  table's initial column sort, so the header shows it and a sort the user
 *  picks replaces it. */
export const EVENTS_DEFAULT_SORT = [{ id: "startsAt", desc: true }];

/**
 * Events table columns: name, start/end dates, and a trailing actions column
 * (copy link / download QR) mirroring the community roster's actions column —
 * `disableRowClick` so those buttons don't also open the sheet. The actions
 * column is present only for whoever can manage events.
 */
export function eventColumns(options: {
	canManage: boolean;
}): JfColumnDefinition<Doc<"events">>[] {
	// `now` is captured per build, and the columns rebuild only when what they
	// read changes. An event silently crossing future→current→past won't
	// re-bucket until then — fine for a board tool that refetches often, and
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
		fieldColumn(eventFields.name, {
			accessorKey: "name",
			dataType: "string",
		}),
		fieldColumn(eventFields.startsAt, {
			accessorKey: "startsAt",
			dataType: "date",
			size: "content",
			cell: (info) =>
				formatDateIn(info.row.original.startsAt, SITE_TIMEZONE),
			measureText: (row) => formatDateIn(row.startsAt, SITE_TIMEZONE),
		}),
		fieldColumn(eventFields.endsAt, {
			accessorKey: "endsAt",
			dataType: "date",
			size: "content",
			cell: (info) =>
				formatDateIn(info.row.original.endsAt, SITE_TIMEZONE),
			measureText: (row) => formatDateIn(row.endsAt, SITE_TIMEZONE),
		}),
		...(options.canManage
			? [
					{
						id: "actions",
						header: "",
						disableRowClick: true,
						size: actionsColumnSize(EVENT_ACTION_COUNT),
						cell: (info) => (
							<EventRowActions row={info.row.original} />
						),
					} satisfies JfColumnDefinition<Doc<"events">>,
				]
			: []),
	];
}
