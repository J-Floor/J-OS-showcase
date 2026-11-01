// @vitest-environment happy-dom
import type { JfColumnDefinition } from "@j-os/design-system";
import { expect, test } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";

import {
	REQUEST_GROUP_COLUMN,
	REQUEST_GROUPINGS,
	requestColumns,
	requestMonth,
	requestSorting,
	type RequestGrouping,
} from "./requestColumns.tsx";

const ROW: PerkRequestRow = {
	_id: "request1" as Id<"perkRequests">,
	perkId: "perk1" as Id<"perks">,
	personId: "person1" as Id<"people">,
	requesterName: "Ada Example",
	requesterEmail: "ada@example.com",
	ventureName: "Acme",
	perkTitle: "Cloud credits",
	partner: "Alpha Labs",
	contactName: "Anna Board",
	requestedAt: Date.UTC(2026, 9, 20, 9),
	status: "contacted",
	statusAt: Date.UTC(2026, 9, 21, 9),
};

/** A column's id: its own, or the field it reads. */
function columnId(
	column: JfColumnDefinition<PerkRequestRow>
): string | undefined {
	return column.id ?? (column as { accessorKey?: string }).accessorKey;
}

/** The hidden group column's value for one row. */
function groupValue(grouping: RequestGrouping, row: PerkRequestRow): unknown {
	const [group] = requestColumns(grouping);
	const read = (
		group as {
			accessorFn?: (original: PerkRequestRow, index: number) => unknown;
		}
	).accessorFn;
	return read?.(row, 0);
}

test("the group column leads, under the id the table groups by", () => {
	for (const grouping of REQUEST_GROUPINGS)
		expect(requestColumns(grouping.value)[0].id).toBe(REQUEST_GROUP_COLUMN);
});

test("status groups are the four statuses, in the order a request moves through them", () => {
	const [group] = requestColumns("status");
	expect(group.dataType).toBe("enum");
	expect(group.enumOptions).toEqual([
		{ value: "requested", label: "Requested" },
		{ value: "contacted", label: "Contacted" },
		{ value: "granted", label: "Granted" },
		{ value: "declined", label: "Declined" },
	]);
	expect(groupValue("status", ROW)).toBe("contacted");
});

test("perk groups read Partner · Title, requester groups the requester's name", () => {
	expect(groupValue("perk", ROW)).toBe("Alpha Labs · Cloud credits");
	expect(groupValue("requester", ROW)).toBe("Ada Example");
});

test("month groups follow the Zurich calendar, not UTC", () => {
	// 23:30 UTC on 31 October is already 00:30 on 1 November in Zurich.
	expect(
		groupValue("month", {
			...ROW,
			requestedAt: Date.UTC(2026, 9, 31, 23, 30),
		})
	).toBe("November 2026");
	expect(
		groupValue("month", {
			...ROW,
			requestedAt: Date.UTC(2026, 9, 31, 22, 30),
		})
	).toBe("October 2026");
	expect(requestMonth(Date.UTC(2026, 9, 20, 9))).toBe("October 2026");
});

test("every grouping keeps the same visible columns, the status select included", () => {
	for (const grouping of REQUEST_GROUPINGS) {
		const visible = requestColumns(grouping.value).slice(1);
		expect(visible.map((column) => columnId(column))).toEqual([
			"requesterName",
			"ventureName",
			"perk",
			"contactName",
			"requestedAt",
			"note",
			"status",
		]);
		expect(visible.at(-1)?.disableRowClick).toBe(true);
	}
});

test("the opening sort orders perk and requester groups by name, and rows newest first", () => {
	const byNameThenNewest = [
		{ id: REQUEST_GROUP_COLUMN, desc: false },
		{ id: "requestedAt", desc: true },
	];
	expect(requestSorting("perk")).toEqual(byNameThenNewest);
	expect(requestSorting("requester")).toEqual(byNameThenNewest);
	expect(requestSorting("status")).toEqual([
		{ id: "requestedAt", desc: true },
	]);
	expect(requestSorting("month")).toEqual([
		{ id: "requestedAt", desc: true },
	]);
});
