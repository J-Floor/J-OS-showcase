import { createRoot } from "solid-js";

import { createTable } from "./hooks.ts";
import type { JfColumnDef } from "./types.ts";

type Row = { state: string; name: string };

const columns: JfColumnDef<Row>[] = [
	{ accessorKey: "state", header: "State", dataType: "string" },
	{ accessorKey: "name", header: "Name", dataType: "string" },
];

function data(): Row[] {
	return [
		{ state: "pending", name: "A" },
		{ state: "denied", name: "B" },
		{ state: "pending", name: "C" },
	];
}

test("groupBy hides the grouped column and keeps a flat row model", () => {
	createRoot((dispose) => {
		const { table } = createTable<Row>({
			data,
			columns,
			groupBy: "state",
		});
		// The hook does NOT use getGroupedRowModel; grouping is rendered by
		// Table.Root bucketing the flat row model. So the core row model stays
		// flat (one row per datum, none grouped) and the grouped column is hidden
		// via columnVisibility (its value becomes each group's accordion header).
		const rows = table.getRowModel().rows;
		expect(rows.length).toBe(3);
		expect(rows.some((r) => r.getIsGrouped())).toBe(false);

		// Grouped column is hidden; leaf rows still carry its value so Table.Root
		// can bucket them into "pending" and "denied" groups.
		expect(table.getColumn("state")?.getIsVisible()).toBe(false);
		const groupValues = new Set(rows.map((r) => r.getValue("state")));
		expect(groupValues).toEqual(new Set(["pending", "denied"]));

		dispose();
	});
});
