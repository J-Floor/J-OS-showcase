import { createRoot, createSignal } from "solid-js";

import { columnMeta, createTable } from "./hooks.ts";
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
		// via columnVisibility (its value becomes each group's header).
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

test("the authored size is kept in meta, and an omitted one stays omitted", () => {
	createRoot((dispose) => {
		const { table } = createTable<Row>({
			data,
			columns: [
				{
					accessorKey: "state",
					header: "State",
					dataType: "string",
					size: { min: "content", weight: 2 },
				},
				{ accessorKey: "name", header: "Name", dataType: "string" },
				{ id: "actions", header: "", size: 84 },
				{ id: "widget", header: "W", size: 40, cell: () => "w" },
			],
			enableRowSelection: true,
		});
		function metaOf(id: string) {
			const column = table.getColumn(id);
			if (!column) throw new Error(`no column ${id}`);
			return columnMeta(column);
		}
		function sizeOf(id: string) {
			return metaOf(id).size;
		}
		expect(sizeOf("state")).toEqual({ min: "content", weight: 2 });
		expect(sizeOf("name")).toBeUndefined();
		expect(sizeOf("actions")).toBe(84);
		expect(sizeOf("select")).toBe(48);
		expect(metaOf("actions").customCell).toBe(false);
		expect(metaOf("widget").customCell).toBe(true);
		// TanStack never sees our size: its own default is all it reads.
		expect(table.getColumn("state")?.columnDef.size).toBe(150);
		dispose();
	});
});

test("each dataType gets its filter", () => {
	createRoot((dispose) => {
		type Typed = { n: number; on: boolean; at: number; t: string };
		const { table } = createTable<Typed>({
			data: () => [
				{
					n: 1,
					on: true,
					at: new Date(2026, 9, 8, 12).getTime(),
					t: "09:00",
				},
				{
					n: 5,
					on: false,
					at: new Date(2026, 9, 9, 12).getTime(),
					t: "18:00",
				},
			],
			columns: [
				{ accessorKey: "n", header: "N", dataType: "number" },
				{ accessorKey: "on", header: "On", dataType: "boolean" },
				{ accessorKey: "at", header: "At", dataType: "date" },
				{ accessorKey: "t", header: "T", dataType: "time" },
			],
		});
		function visibleAfter(id: string, value: unknown): number {
			table.setColumnFilters([{ id, value }]);
			return table.getRowModel().rows.length;
		}
		expect(
			visibleAfter("n", { mode: "range", from: "2", to: undefined })
		).toBe(1);
		expect(visibleAfter("on", false)).toBe(1);
		expect(visibleAfter("at", { mode: "exact", value: "2026-10-08" })).toBe(
			1
		);
		expect(
			visibleAfter("t", { mode: "range", from: undefined, to: "12:00" })
		).toBe(1);
		dispose();
	});
});

test("an enum row value no option covers warns once per column", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	// Disposed after the root returns: the warning runs in an effect, and
	// effects run once the root's setup has finished.
	const dispose = createRoot((disposeRoot) => {
		type Flagged = { state: string; tags: string[] };
		createTable<Flagged>({
			data: () => [
				{ state: "ok", tags: ["x", "zzz"] },
				{ state: "", tags: [] },
				{ state: "gone", tags: ["x"] },
			],
			columns: [
				{
					accessorKey: "state",
					header: "State",
					dataType: "enum",
					enumOptions: [{ value: "ok", label: "Ok" }],
				},
				{
					accessorKey: "tags",
					header: "Tags",
					dataType: "enum",
					enumOptions: [{ value: "x", label: "X" }],
				},
			],
		});
		return disposeRoot;
	});
	dispose();
	expect(warn).toHaveBeenCalledTimes(2);
	expect(warn.mock.calls[0][0]).toContain('column "state"');
	expect(warn.mock.calls[0][0]).toContain('"gone"');
	expect(warn.mock.calls[1][0]).toContain('"zzz"');
	warn.mockRestore();
});

test("an enum column warns once, even as new unmatched values arrive", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	type Stated = { state: string };
	const [rows, setRows] = createSignal<Stated[]>([{ state: "gone" }]);
	const dispose = createRoot((disposeRoot) => {
		createTable<Stated>({
			data: rows,
			columns: [
				{
					accessorKey: "state",
					header: "State",
					dataType: "enum",
					enumOptions: [{ value: "ok", label: "Ok" }],
				},
			],
		});
		return disposeRoot;
	});
	expect(warn).toHaveBeenCalledTimes(1);
	setRows([{ state: "gone" }, { state: "lost" }]);
	expect(warn).toHaveBeenCalledTimes(1);
	dispose();
	warn.mockRestore();
});

test("an actions column that is not last warns", () => {
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	createRoot((dispose) => {
		createTable<Row>({
			data,
			columns: [
				{ id: "actions", header: "", size: 84, cell: () => null },
				...columns,
			],
		});
		dispose();
	});
	expect(warn).toHaveBeenCalledTimes(1);
	expect(warn.mock.calls[0][0]).toContain('"actions"');
	warn.mockClear();
	createRoot((dispose) => {
		createTable<Row>({
			data,
			columns: [
				...columns,
				{ id: "actions", header: "", size: 84, cell: () => null },
			],
		});
		dispose();
	});
	expect(warn).not.toHaveBeenCalled();
	warn.mockRestore();
});
