import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";

import { isPerkExpired } from "../../../convex/lib/perks.ts";
import type { PerkRow } from "../../../convex/perks.ts";

import { perkFields } from "./fields.ts";
import { formatValidUntil } from "./perkDate.ts";
import { PERK_CATEGORY_OPTIONS } from "./perkOptions.ts";

/** The two accordion buckets, in display order. */
const availabilityOptions = [
	{ value: "active", label: "Active" },
	{ value: "expired", label: "Expired" },
] as const;

type PerkAvailability = (typeof availabilityOptions)[number]["value"];

/** Whether a perk can still be requested: active through its last day in
 *  Zurich, and for good when it has no end date. */
export function perkAvailability(row: PerkRow, now: number): PerkAvailability {
	return isPerkExpired(row.validUntil, now) ? "expired" : "active";
}

/** The end date as the instant the date filter compares. Noon UTC falls on
 *  the stored day from UTC-11 to UTC+11; midnight would slip to the day
 *  before anywhere west of UTC. */
function validUntilInstant(row: PerkRow): number | undefined {
	return row.validUntil === undefined
		? undefined
		: Date.parse(`${row.validUntil}T12:00:00Z`);
}

/** Partner A to Z in every group: the groups render over the one sorted row
 *  model. Applied as the table's initial column sort, so the header shows it
 *  and a sort the user picks replaces it. */
export const PERKS_DEFAULT_SORT = [{ id: "partner", desc: false }];

/**
 * Perks table columns: partner, perk, category and end date, plus the hidden
 * `availability` column the table groups by.
 */
export function perkColumns(): JfColumnDefinition<PerkRow>[] {
	// Captured once when the columns are built (Table reads its config once
	// at setup), as on events: a perk that expires while the page is open
	// moves to Expired on the next visit.
	const now = Date.now();
	return [
		{
			// Hidden grouping column (`Table` hides whatever it groups by): the
			// derived value must live in a column for `groupBy="availability"`
			// to resolve; it shows only as the accordion header.
			id: "availability",
			header: "Availability",
			dataType: "enum",
			enumOptions: availabilityOptions,
			accessorFn: (row) => perkAvailability(row, now),
		},
		fieldColumn(perkFields.partner, {
			accessorKey: "partner",
			dataType: "string",
		}),
		fieldColumn(perkFields.title, {
			accessorKey: "title",
			dataType: "string",
		}),
		fieldColumn(perkFields.category, {
			accessorKey: "category",
			dataType: "enum",
			enumOptions: PERK_CATEGORY_OPTIONS,
			size: "content",
		}),
		fieldColumn(perkFields.validUntil, {
			dataType: "date",
			size: "content",
			accessorFn: validUntilInstant,
			cell: (info) => formatValidUntil(info.row.original.validUntil),
			measureText: (row) => formatValidUntil(row.validUntil),
		}),
	];
}
