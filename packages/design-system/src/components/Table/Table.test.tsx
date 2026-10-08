import { readFileSync } from "node:fs";

import {
	cleanup,
	render,
	screen,
	waitFor,
	fireEvent,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { setDeferredImmediate } from "../Deferred/Deferred.tsx";

import { ANIMATED_COLUMNS } from "./columnLayout.ts";
import { setTableTextMeasurer } from "./columnWidths.ts";
import {
	BODY_TEXT_CELL_SELECTOR,
	COLUMN_ID_ATTR,
	HEADER_ACTIONS_ATTR,
	HEADER_CELL_ATTR,
	HEADER_COLUMN_SELECTOR,
	HEADER_LABEL_ATTR,
	TEXT_CELL_ATTR,
} from "./domContract.ts";
import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

// jsdom workarounds for ark/zag (Popover/Tooltip) used by header buttons.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

type Row = { name: string; score: number };
const columns = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "score", header: "Score", dataType: "number" },
] as const;
function data(): Row[] {
	return [
		{ name: "B", score: 1 },
		{ name: "A", score: 2 },
	];
}
const loadedRows = data();

type IdRow = { id: string };
const idColumns = [
	{ accessorKey: "id", header: "ID", dataType: "string" },
] as const;

test("onDisplayedRowsChange fires with on-screen row order", async () => {
	let captured: IdRow[] = [];
	render(() => (
		<Table.Root
			columns={idColumns as never}
			data={[{ id: "a" }, { id: "b" }, { id: "c" }] as IdRow[]}
			onDisplayedRowsChange={(rows: IdRow[]) => {
				captured = rows;
			}}
		/>
	));
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});

test("onSelectedRowsChange fires with the checked rows, not written from inside BatchActions' render prop", async () => {
	// Regression for a signal write during render: a consumer used to have to
	// call its own setter from inside `Table.BatchActions`' children function,
	// which runs mid-render. This prop fires from a `createEffect` instead, the
	// same shape as `onDisplayedRowsChange` above.
	let captured: IdRow[] = [];
	render(() => (
		<Table.Root
			columns={idColumns as never}
			data={[{ id: "a" }, { id: "b" }, { id: "c" }] as IdRow[]}
			enableRowSelection
			onSelectedRowsChange={(rows: IdRow[]) => {
				captured = rows;
			}}
		/>
	));
	await waitFor(() => {
		expect(captured).toEqual([]);
	});
	// checkbox[0] is the header select-all; the rest are per-row.
	const checkboxes = screen.getAllByRole("checkbox");
	fireEvent.click(checkboxes[1]);
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a"]);
	});
	fireEvent.click(checkboxes[3]);
	await waitFor(() => {
		expect(captured.map((r) => r.id)).toEqual(["a", "c"]);
	});
});

test("renders rows and sorts by column", () => {
	render(() => (
		<Table.Root
			columns={columns as never}
			data={data()}
			initialColumnSorting={[{ id: "score", desc: true }]}
		/>
	));
	const rows = screen.getAllByRole("row");
	// header + 2 data rows
	expect(rows.length).toBe(3);
	expect(rows[1]).toHaveTextContent("A"); // score 2 first (desc)
});

type ActionRow = { name: string; group: string };
const actionColumns: JfColumnDef<ActionRow>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
	{ accessorKey: "group", header: "Group", dataType: "string" },
	{
		id: "actions",
		header: "",
		size: 84,
		cell: () => <button type="button">act</button>,
	},
];

/** Cells per row, header and body, so the two can be compared. */
function cellCounts(): { head: number; body: number } {
	const table = document.querySelector("table");
	const head = table?.querySelector("thead tr")?.children.length ?? 0;
	const body = Array.from(table?.querySelectorAll("tbody tr") ?? [])
		.map((tr) => tr.children.length)
		.find((n) => n > 1);
	return { head, body: body ?? 0 };
}

test("header and body rows have one cell per visible column, grouped or not", () => {
	render(() => (
		<Table.Root
			columns={actionColumns}
			data={[{ name: "A", group: "G" }]}
			groupBy="group"
		/>
	));
	// Name and actions: the grouped column is hidden, and no spacer cell is
	// rendered for the filler track.
	expect(cellCounts()).toEqual({ head: 2, body: 2 });
});

test("the plain table renders every column", () => {
	render(() => (
		<Table.Root
			columns={actionColumns}
			data={[{ name: "A", group: "G" }]}
		/>
	));
	expect(cellCounts()).toEqual({
		head: actionColumns.length,
		body: actionColumns.length,
	});
});

test("ungrouped skeleton has one cell per header cell, even with an actions column", () => {
	render(() => <Table.Root columns={actionColumns} data={undefined} />);
	const headCells = document.querySelectorAll("thead tr th").length;
	const skeletonCells = document
		.querySelector("[data-skeleton-row]")
		?.querySelectorAll("td").length;
	expect(skeletonCells).toBe(headCells);
});

// The blank-table-after-tab-switch recovery is exercised end-to-end in
// Virtualize.test.tsx: the reactive `scrollParentHeight` signal drives
// `virtualizing()` both ways across a hide/show cycle, so any zero-height
// measurements taken while the tab panel was hidden are re-taken against
// real rows on return — no `needsRemeasure` heuristic needed.

test("undefined data renders skeleton rows, not 'No results.'", () => {
	render(() => <Table.Root columns={columns as never} data={undefined} />);
	expect(screen.queryByText("No results.")).toBeNull();
	expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
});

test("loading renders one skeleton cell per visible column", () => {
	render(() => <Table.Root columns={columns as never} data={[]} loading />);
	const row = document.querySelector("[data-skeleton-row]");
	expect(row?.querySelectorAll("td").length).toBe(columns.length);
});

test("the header renders while loading", () => {
	render(() => <Table.Root columns={columns as never} data={undefined} />);
	expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(0);
});

test("first mount shows skeleton rows until the paint, then real rows", async () => {
	setDeferredImmediate(false);
	vi.useFakeTimers();
	try {
		render(() => (
			<Table.Root columns={columns as never} data={loadedRows} />
		));
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(8);
		await vi.runAllTimersAsync();
		expect(document.querySelectorAll("[data-skeleton-row]").length).toBe(0);
	} finally {
		vi.useRealTimers();
		setDeferredImmediate(true);
	}
});

// --- column layout ---------------------------------------------------------
// jsdom lays nothing out and has no canvas. These tests inject a measurer
// (ten px per character), give each header label a `scrollWidth` of ten px per
// character and each header's buttons 30px, and zero jsdom's default cell
// padding (the component stylesheet is not loaded), so a column's content
// width is its widest text plus the 1px sub-pixel slack.

const BUTTONS_WIDTH = 30;

function rawTracks(): string {
	return (
		document
			.querySelector<HTMLElement>("table")
			?.style.getPropertyValue("--jf-table-tracks") ?? ""
	);
}

/** The track list as every row resolves it: each `var(--jf-col-<i>)` a
 *  content track reads, replaced by the width the table sets it to. */
function tracks(): string {
	const table = document.querySelector<HTMLElement>("table");
	return rawTracks().replaceAll(
		/var\((--jf-col-\d+)\)/g,
		(_, name: string) => (table ? table.style.getPropertyValue(name) : "")
	);
}

function floor(): string {
	return (
		document
			.querySelector<HTMLElement>("table")
			?.style.getPropertyValue("--jf-table-floor") ?? ""
	);
}

describe("column tracks", () => {
	let noPadding: HTMLStyleElement;

	beforeEach(() => {
		noPadding = document.createElement("style");
		noPadding.textContent = "th, td { padding: 0; }";
		document.head.append(noPadding);
		setTableTextMeasurer(() => (text) => text.length * 10);
		Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
			configurable: true,
			get(this: HTMLElement) {
				return this.hasAttribute("data-header-label")
					? this.textContent.length * 10
					: 0;
			},
		});
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
			function (this: Element) {
				const width = this.hasAttribute("data-header-actions")
					? BUTTONS_WIDTH
					: 0;
				return new DOMRect(0, 0, width, 0);
			}
		);
	});

	afterEach(() => {
		noPadding.remove();
		setTableTextMeasurer(undefined);
		Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
		vi.restoreAllMocks();
	});

	type Person = { name: string; team: string; note: string };
	const people: Person[] = [
		{ name: "Ada", team: "Core", note: "x" },
		{ name: "Grace Hopper", team: "Core", note: "y" },
	];
	const personColumns: JfColumnDef<Person>[] = [
		{ accessorKey: "name", header: "Name", dataType: "string" },
		{ accessorKey: "team", header: "Team", dataType: "string" },
		{
			accessorKey: "note",
			header: "Note",
			dataType: "string",
			size: { min: 200, weight: 2 },
			measureText: false,
		},
		{
			id: "actions",
			header: "",
			size: 84,
			cell: () => <button type="button">act</button>,
		},
	];

	test("list the visible leaf columns in order, grouped column excluded", () => {
		render(() => (
			<Table.Root columns={personColumns} data={people} groupBy="team" />
		));
		// Name: "Grace Hopper" 120 + 1 beats the header 40 + 30 + 1.
		expect(tracks()).toBe("minmax(121px, 1fr) minmax(200px, 2fr) 84px");
		expect(floor()).toBe("405px");
	});

	test("are the same shape in a flat table", () => {
		render(() => <Table.Root columns={personColumns} data={people} />);
		// Team: the header "Team" 40 + 30 + 1 beats its widest cell, 41.
		expect(tracks()).toBe(
			"minmax(121px, 1fr) minmax(71px, 1fr) minmax(200px, 2fr) 84px"
		);
	});

	test("put a filler track before the actions column when nothing flexes", () => {
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
					},
					personColumns[3],
				]}
				data={people}
			/>
		));
		expect(tracks()).toBe("121px minmax(0, 1fr) 84px");
	});

	test("put the filler last when nothing flexes and there is no actions column", () => {
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
					},
				]}
				data={people}
			/>
		));
		expect(tracks()).toBe("121px minmax(0, 1fr)");
	});

	test("lead with a 48px select column", () => {
		render(() => (
			<Table.Root
				columns={personColumns}
				data={people}
				enableRowSelection
			/>
		));
		expect(tracks().startsWith("48px ")).toBe(true);
	});

	test("measure rows a filter hides", () => {
		render(() => (
			<Table.Root
				columns={personColumns}
				data={people}
				groupBy="team"
				initialColumnFilters={[{ id: "name", value: "Ada" }]}
			/>
		));
		expect(screen.queryByText("Grace Hopper")).toBeNull();
		expect(tracks()).toBe("minmax(121px, 1fr) minmax(200px, 2fr) 84px");
	});

	test("do not change when a group collapses", () => {
		render(() => (
			<Table.Root columns={personColumns} data={people} groupBy="team" />
		));
		const before = tracks();
		fireEvent.click(screen.getByRole("button", { expanded: true }));
		expect(screen.queryByText("Grace Hopper")).toBeNull();
		expect(tracks()).toBe(before);
	});

	test("widen when rows arrive", () => {
		const [rows, setRows] = createSignal<Person[]>([people[0]]);
		render(() => (
			<Table.Root columns={personColumns} data={rows()} groupBy="team" />
		));
		// "Name" header 40 + 30 + 1 beats "Ada" 31.
		expect(tracks()).toBe("minmax(71px, 1fr) minmax(200px, 2fr) 84px");
		setRows(people);
		expect(tracks()).toBe("minmax(121px, 1fr) minmax(200px, 2fr) 84px");
	});

	test("measure an enum column by its option labels", () => {
		type Op = { op: string };
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "op",
						header: "Op",
						dataType: "enum",
						size: "content",
						enumOptions: [
							{ value: "dry-run", label: "Dry run, skipped" },
						],
					},
				]}
				data={[{ op: "dry-run" }] satisfies Op[]}
			/>
		));
		// "Dry run, skipped" is 16 characters: 160 + 1.
		expect(tracks()).toBe("161px minmax(0, 1fr)");
	});

	test("measure only the rows a data push adds or replaces", () => {
		const measureText = vi.fn((row: Person) => row.name);
		const [rows, setRows] = createSignal<Person[]>(people);
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
						measureText,
					},
				]}
				data={rows()}
			/>
		));
		expect(measureText).toHaveBeenCalledTimes(2);
		measureText.mockClear();
		const added: Person = { name: "Lin", team: "Core", note: "z" };
		const replaced: Person = { ...people[0], name: "Ada L" };
		setRows([replaced, people[1], added]);
		expect(measureText.mock.calls.map(([row]) => row)).toEqual([
			replaced,
			added,
		]);
	});

	test("skip rows a push hands back as fresh but equal objects", () => {
		const measureText = vi.fn((row: Person) => row.name);
		const [rows, setRows] = createSignal<Person[]>(people);
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
						measureText,
					},
				]}
				data={rows()}
			/>
		));
		measureText.mockClear();
		setRows(people.map((person) => ({ ...person })));
		expect(measureText).not.toHaveBeenCalled();
		const changed = { ...people[1], note: "edited" };
		setRows([{ ...people[0] }, changed]);
		expect(measureText.mock.calls.map(([row]) => row)).toEqual([changed]);
	});

	test("measure only a row a push inserts at the head", () => {
		type Doc = { _id: string; name: string };
		const measureText = vi.fn((row: Doc) => row.name);
		const docs: Doc[] = [
			{ _id: "a", name: "Ada" },
			{ _id: "b", name: "Grace" },
		];
		const [rows, setRows] = createSignal<Doc[]>(docs);
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
						measureText,
					},
				]}
				data={rows()}
			/>
		));
		measureText.mockClear();
		const head: Doc = { _id: "z", name: "Lin" };
		setRows([head, ...docs.map((doc) => ({ ...doc }))]);
		expect(measureText.mock.calls.map(([row]) => row)).toEqual([head]);
	});

	test("grow when a wider row arrives and keep the width when it leaves", () => {
		const [rows, setRows] = createSignal<Person[]>([people[0]]);
		render(() => (
			<Table.Root columns={personColumns} data={rows()} groupBy="team" />
		));
		expect(tracks()).toBe("minmax(71px, 1fr) minmax(200px, 2fr) 84px");
		setRows(people);
		expect(tracks()).toBe("minmax(121px, 1fr) minmax(200px, 2fr) 84px");
		setRows([people[0]]);
		expect(tracks()).toBe("minmax(121px, 1fr) minmax(200px, 2fr) 84px");
	});

	test("content tracks read one width property each, set on the table", () => {
		const [rows, setRows] = createSignal<Person[]>([people[0]]);
		render(() => <Table.Root columns={personColumns} data={rows()} />);
		const before = rawTracks();
		expect(before).toBe(
			"minmax(var(--jf-col-0), 1fr) minmax(var(--jf-col-1), 1fr) minmax(200px, 2fr) 84px"
		);
		setRows(people);
		// A wider row moves only the width property, never the track list:
		// every row reads the one value the table animates.
		expect(rawTracks()).toBe(before);
		expect(
			document
				.querySelector<HTMLElement>("table")
				?.style.getPropertyValue("--jf-col-0")
		).toBe("121px");
	});

	test("skip rows a push hands back with fresh but equal nested values", () => {
		type Nested = {
			_id: string;
			name: string;
			venture: { name: string; links: { url: string }[] };
		};
		const measureText = vi.fn((row: Nested) => row.name);
		const docs: Nested[] = [
			{
				_id: "a",
				name: "Ada",
				venture: { name: "V", links: [{ url: "https://a" }] },
			},
		];
		const [rows, setRows] = createSignal<Nested[]>(docs);
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
						measureText,
					},
				]}
				data={rows()}
			/>
		));
		measureText.mockClear();
		setRows(docs.map((doc) => structuredClone(doc)));
		expect(measureText).not.toHaveBeenCalled();
		const changed = structuredClone(docs[0]);
		changed.venture.links[0].url = "https://b";
		setRows([changed]);
		expect(measureText.mock.calls.map(([row]) => row)).toEqual([changed]);
	});

	test("re-measure a measureVolatile column on every pass", () => {
		const volatile = vi.fn((row: Person) => row.name);
		const [rows, setRows] = createSignal<Person[]>(people);
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "name",
						header: "Name",
						dataType: "string",
						size: "content",
						measureText: volatile,
						measureVolatile: true,
					},
				]}
				data={rows()}
			/>
		));
		volatile.mockClear();
		setRows(people.map((person) => ({ ...person })));
		expect(volatile).toHaveBeenCalledTimes(2);
	});

	test("animate track changes only once the first layout has settled", async () => {
		render(() => <Table.Root columns={personColumns} data={people} />);
		const table = document.querySelector("table");
		expect(table).not.toHaveAttribute("data-animate-tracks");
		await waitFor(() => {
			expect(table).toHaveAttribute("data-animate-tracks", "true");
		});
	});

	test("warn once about a content column whose custom cell has no text", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		type Tagged = { tags: string[] };
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "tags",
						header: "Tags",
						dataType: "string",
						cell: (info) => info.row.original.tags.join(" "),
					},
				]}
				data={[{ tags: ["a"] }, { tags: ["b"] }] satisfies Tagged[]}
			/>
		));
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toContain('column "tags"');
	});
});

describe("column re-measure", () => {
	type Named = { name: string };
	const named: Named[] = [{ name: "Ada" }, { name: "Grace Hopper" }];
	const nameColumns: JfColumnDef<Named>[] = [
		{
			accessorKey: "name",
			header: "Name",
			dataType: "string",
			size: "content",
		},
	];
	let fonts: EventTarget;
	let fontStyle: HTMLStyleElement;
	let measures: string[];

	beforeEach(() => {
		measures = [];
		setTableTextMeasurer((font) => {
			measures.push(font.font);
			const perChar = measures.length * 10;
			return (text) => text.length * perChar;
		});
		fonts = new EventTarget();
		Object.assign(fonts, { ready: Promise.resolve(fonts) });
		Object.defineProperty(document, "fonts", {
			configurable: true,
			value: fonts,
		});
		fontStyle = document.createElement("style");
		fontStyle.textContent =
			"th, td { padding: 0; } th { font-weight: 700; } td { font-weight: 400; }";
		document.head.append(fontStyle);
	});

	afterEach(() => {
		fontStyle.remove();
		setTableTextMeasurer(undefined);
		Reflect.deleteProperty(document, "fonts");
		Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
		vi.unstubAllGlobals();
	});

	async function settle(): Promise<void> {
		await Promise.resolve();
		await Promise.resolve();
	}

	test("re-measure once when web fonts finish loading", async () => {
		render(() => <Table.Root columns={nameColumns} data={named} />);
		await settle();
		expect(measures).toHaveLength(1);
		// "Grace Hopper" at 10px a character, + 1.
		expect(tracks()).toBe("121px minmax(0, 1fr)");
		fonts.dispatchEvent(new Event("loadingdone"));
		await settle();
		expect(measures).toHaveLength(2);
		expect(tracks()).toBe("241px minmax(0, 1fr)");
	});

	test("stop listening for fonts once unmounted", async () => {
		const { unmount } = render(() => (
			<Table.Root columns={nameColumns} data={named} />
		));
		await settle();
		unmount();
		fonts.dispatchEvent(new Event("loadingdone"));
		expect(measures).toHaveLength(1);
	});

	test("measure the body font, bold in a focusable table", () => {
		render(() => <Table.Root columns={nameColumns} data={named} />);
		expect(measures[0]).toContain(" 400 ");
		cleanup();
		measures = [];
		render(() => (
			<Table.Root columns={nameColumns} data={named} focusableRows />
		));
		expect(measures[0]).toContain(" 700 ");
	});

	test("read the body font with no body cell to read it from", () => {
		const [rows, setRows] = createSignal<Named[]>([]);
		render(() => <Table.Root columns={nameColumns} data={rows()} />);
		expect(measures).toEqual([expect.stringContaining(" 400 ")]);
		setRows(named);
		expect(tracks()).toBe("121px minmax(0, 1fr)");
	});

	test("measure exactly again after a font load, dropping widths kept from removed rows", async () => {
		const perChar = [20, 10];
		setTableTextMeasurer(() => {
			const width = perChar.shift() ?? 10;
			return (text) => text.length * width;
		});
		const [rows, setRows] = createSignal<Named[]>(named);
		render(() => <Table.Root columns={nameColumns} data={rows()} />);
		await settle();
		// "Grace Hopper" at 20px a character, + 1.
		expect(tracks()).toBe("241px minmax(0, 1fr)");
		setRows([named[0]]);
		expect(tracks()).toBe("241px minmax(0, 1fr)");
		fonts.dispatchEvent(new Event("loadingdone"));
		await settle();
		// "Ada" at 10px a character, + 1.
		expect(tracks()).toBe("31px minmax(0, 1fr)");
	});

	test("keep widths when a font that measures nothing differently loads", async () => {
		setTableTextMeasurer(() => (text) => text.length * 10);
		const [rows, setRows] = createSignal<Named[]>(named);
		render(() => <Table.Root columns={nameColumns} data={rows()} />);
		await settle();
		setRows([named[0]]);
		expect(tracks()).toBe("121px minmax(0, 1fr)");
		fonts.dispatchEvent(new Event("loadingdone"));
		await settle();
		expect(tracks()).toBe("121px minmax(0, 1fr)");
	});

	test("animate track changes only once a hidden table has been shown", async () => {
		let shown = false;
		const observers: (() => void)[] = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: () => void) {
					observers.push(callback);
				}
				observe(): void {}
				unobserve(): void {}
				disconnect(): void {}
			}
		);
		render(() => (
			<div
				style={{ "overflow-y": "auto" }}
				ref={(el) => {
					Object.defineProperty(el, "clientHeight", {
						configurable: true,
						get: () => (shown ? 400 : 0),
					});
				}}
			>
				<Table.Root columns={nameColumns} data={named} />
			</div>
		));
		const table = document.querySelector("table");
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(table).not.toHaveAttribute("data-animate-tracks");
		shown = true;
		for (const observe of observers) observe();
		await waitFor(() => {
			expect(table).toHaveAttribute("data-animate-tracks", "true");
		});
	});

	test("re-measure the headers once a hidden scroll parent gets a height", () => {
		let shown = false;
		Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
			configurable: true,
			get(this: HTMLElement) {
				return shown && this.hasAttribute("data-header-label")
					? this.textContent.length * 100
					: 0;
			},
		});
		const observers: (() => void)[] = [];
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: () => void) {
					observers.push(callback);
				}
				observe(): void {}
				unobserve(): void {}
				disconnect(): void {}
			}
		);
		render(() => (
			<div
				data-testid="scroller"
				style={{ "overflow-y": "auto" }}
				ref={(el) => {
					Object.defineProperty(el, "clientHeight", {
						configurable: true,
						get: () => (shown ? 400 : 0),
					});
				}}
			>
				<Table.Root columns={nameColumns} data={named} />
			</div>
		));
		expect(tracks()).toBe("121px minmax(0, 1fr)");
		shown = true;
		for (const observe of observers) observe();
		// The "Name" label at 100px a character, + 1.
		expect(tracks()).toBe("401px minmax(0, 1fr)");
	});
});

describe("accessibility", () => {
	test("rows, cells and headers carry explicit roles", () => {
		render(() => <Table.Root columns={columns as never} data={data()} />);
		expect(screen.getByRole("table")).toBeInTheDocument();
		expect(screen.getAllByRole("rowgroup")).toHaveLength(2);
		const headers = screen.getAllByRole("columnheader");
		expect(headers).toHaveLength(2);
		for (const header of headers)
			expect(header).toHaveAttribute("scope", "col");
		expect(screen.getAllByRole("cell")).toHaveLength(4);
	});

	test("a focusable table is a grid of gridcells", () => {
		render(() => (
			<Table.Root
				columns={columns as never}
				data={data()}
				focusableRows
			/>
		));
		expect(screen.getByRole("grid")).toBeInTheDocument();
		expect(screen.getAllByRole("gridcell")).toHaveLength(4);
	});

	test("headerColumn makes the first column after the checkbox a row header", () => {
		render(() => (
			<Table.Root
				columns={columns as never}
				data={data()}
				enableRowSelection
				headerColumn
			/>
		));
		const rowHeaders = screen.getAllByRole("rowheader");
		expect(rowHeaders.map((cell) => cell.textContent)).toEqual(["B", "A"]);
		expect(rowHeaders[0].tagName).toBe("TH");
	});

	test("aria-sort tells the sort state, and only on sortable columns", () => {
		render(() => (
			<Table.Root
				columns={[
					...(columns as unknown as JfColumnDef<Row>[]),
					{ id: "actions", header: "", size: 84, cell: () => null },
				]}
				data={data()}
				initialColumnSorting={[{ id: "score", desc: true }]}
			/>
		));
		const [name, score, actions] = screen.getAllByRole("columnheader");
		expect(name).toHaveAttribute("aria-sort", "none");
		expect(score).toHaveAttribute("aria-sort", "descending");
		expect(actions).not.toHaveAttribute("aria-sort");
	});

	test("group header and empty rows span every column", () => {
		render(() => (
			<Table.Root
				columns={actionColumns}
				data={[{ name: "A", group: "G" }]}
				groupBy="group"
			/>
		));
		expect(
			document
				.querySelector("tbody tr td[colspan]")
				?.getAttribute("colspan")
		).toBe("2");
		cleanup();
		render(() => <Table.Root columns={actionColumns} data={[]} />);
		expect(screen.getByText("No results.").getAttribute("colspan")).toBe(
			"3"
		);
	});
});

describe("default enum cell", () => {
	type Op = { op: string; tags: string[] };
	const opData: Op[] = [{ op: "dry-run", tags: ["x", "y"] }];
	const opOptions = [{ value: "dry-run", label: "Dry run" }];

	test("shows the option label, the text it was measured by", () => {
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "op",
						header: "Op",
						dataType: "enum",
						enumOptions: opOptions,
					},
					{
						accessorKey: "tags",
						header: "Tags",
						dataType: "enum",
						enumOptions: [
							{ value: "x", label: "Ex" },
							{ value: "y", label: "Why" },
						],
					},
				]}
				data={opData}
			/>
		));
		expect(
			screen.getByRole("cell", { name: "Dry run" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("cell", { name: "Ex, Why" })
		).toBeInTheDocument();
		expect(screen.queryByText("dry-run")).toBeNull();
	});

	test("gives way to a custom cell", () => {
		render(() => (
			<Table.Root
				columns={[
					{
						accessorKey: "op",
						header: "Op",
						dataType: "enum",
						enumOptions: opOptions,
						cell: (info) => `raw ${String(info.getValue())}`,
					},
				]}
				data={opData}
			/>
		));
		expect(screen.getByText("raw dry-run")).toBeInTheDocument();
	});
});

describe("DOM contract", () => {
	test("the rendered header and body attributes match the selector constants", () => {
		render(() => <Table.Root columns={columns as never} data={data()} />);
		const th = document.querySelector(HEADER_COLUMN_SELECTOR);
		expect(th?.getAttribute(COLUMN_ID_ATTR)).toBe("name");
		for (const attr of [
			HEADER_CELL_ATTR,
			HEADER_LABEL_ATTR,
			HEADER_ACTIONS_ATTR,
		]) {
			expect(th?.querySelector(`[${attr}]`)).not.toBeNull();
		}
		expect(document.querySelector(BODY_TEXT_CELL_SELECTOR)).not.toBeNull();
	});

	test("skeleton cells match the body text-cell selector", () => {
		render(() => (
			<Table.Root columns={columns as never} data={[]} loading />
		));
		expect(
			document.querySelector(
				`tbody [data-skeleton-row] [${TEXT_CELL_ATTR}]`
			)
		).not.toBeNull();
	});
});

describe("track animation stylesheet", () => {
	const scss = readFileSync(
		`${import.meta.dirname}/Table.module.scss`,
		"utf8"
	);

	test("register the width properties so they interpolate", () => {
		expect(scss).toMatch(
			/@property --jf-col-#\{\$i\}\s*\{[^}]*syntax: "<length>"/
		);
		expect(scss).toMatch(
			/@property --jf-table-floor\s*\{[^}]*syntax: "<length>"/
		);
	});

	test("register as many width properties as the layout writes", () => {
		expect(scss).toContain(
			`$animated-columns: ${String(ANIMATED_COLUMNS)};`
		);
	});

	test("animate on the table only, for viewers who allow motion", () => {
		expect(scss).toMatch(
			/&\[data-animate-tracks="true"\]\s*\{\s*@media \(prefers-reduced-motion: no-preference\)\s*\{\s*transition-duration/
		);
		// A per-row transition makes a newly mounted row jump while the
		// others slide.
		expect(scss).not.toMatch(/transition:\s*grid-template-columns/);
	});
});
