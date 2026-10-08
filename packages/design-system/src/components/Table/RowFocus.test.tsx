import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { Table } from "./Table.tsx";
import type { JfColumnDef } from "./types.ts";

type Row = { _id: string; name: string };
// Annotated rather than inferred: `Table` takes its own `JfColumnDef`, whose
// `dataType` is a literal union, so an unannotated object literal widens it to
// `string` and stops matching. A `createColumnHelper` accessor does not satisfy
// it either — it carries no `dataType` at all.
const columns: JfColumnDef<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
];
const data: Row[] = [
	{ _id: "a", name: "Ada" },
	{ _id: "b", name: "Grace" },
	{ _id: "c", name: "Hedy" },
];

function focused(): string | null {
	const row = document.querySelector('tr[data-focused="true"]');
	if (!row) return null;
	// The last cell, not the whole row: with `enableRowSelection` the row also
	// carries the select column's checkbox, whose two state icons are always in
	// the DOM (Ark hides the unmatched one via the `hidden` attribute, which
	// does not remove it from `textContent`) and would otherwise leak into it.
	return row.querySelector("td:last-child")?.textContent ?? null;
}

function grid(): HTMLElement {
	return screen.getByRole("grid");
}

/** Keys go to the table only while it holds focus, as in the browser. */
function press(key: string): void {
	grid().focus();
	fireEvent.keyDown(grid(), { key });
}

test("the first arrow press focuses the first row", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	expect(focused()).toBeNull();
	press("ArrowDown");
	expect(focused()).toBe("Ada");
});

test("autofocusFirstRow rings the first row before any keypress", async () => {
	// A triage queue lands you on a row ready to act, rather than making you
	// prime the ring with an arrow first.
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			autofocusFirstRow
		/>
	));
	await Promise.resolve();
	expect(focused()).toBe("Ada");
});

test("autofocusFirstRow reports the first row via onFocusedRowChange on mount", async () => {
	const seen: (string | undefined)[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			autofocusFirstRow
			onFocusedRowChange={(row) => seen.push(row?._id)}
		/>
	));
	await Promise.resolve();
	expect(seen).toEqual(["a"]);
});

test("autofocusFirstRow is off by default — nothing is focused on mount", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	expect(focused()).toBeNull();
});

test("a pinned, suppressed ring ignores Enter even while the grid has focus", () => {
	// Pinned + suppressed is how an open drawer looks: the ring IS shown on the
	// pinned row and `ringRowId` is defined, so only the handler's `ringLive()`
	// check stands between Enter and a stacked reopen.
	const activated: string[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			suppressFocus
			activeRowId={() => "b"}
			onRowActivate={(row) => activated.push(row._id)}
		/>
	));
	grid().focus();
	expect(focused()).toBe("Grace");
	expect(grid().getAttribute("aria-activedescendant")).not.toBeNull();
	fireEvent.keyDown(grid(), { key: "Enter" });
	expect(activated).toEqual([]);
});

test("suppressFocus clears the ring and blocks it (e.g. while a drawer is open)", () => {
	const [suppressed, setSuppressed] = createSignal(false);
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			suppressFocus={suppressed()}
		/>
	));
	press("ArrowDown");
	expect(focused()).toBe("Ada");
	// Drawer opens: the ring must clear, or Enter would reopen it stacked on top.
	setSuppressed(true);
	expect(focused()).toBeNull();
	// And arrows do nothing while suppressed.
	press("ArrowDown");
	expect(focused()).toBeNull();
});

test("moving the ring scrolls the newly-focused row into view", async () => {
	// jsdom ships no `scrollIntoView`, so the effect's own guard would skip it —
	// stub it so we can assert the ring keeps its row on screen (the parallel of
	// the command palette keeping its highlighted option visible).
	const scrollIntoView = vi.fn();
	const original = Object.getOwnPropertyDescriptor(
		Element.prototype,
		"scrollIntoView"
	);
	Element.prototype.scrollIntoView = scrollIntoView;
	try {
		render(() => (
			<Table.Root columns={columns} data={data} focusableRows />
		));
		press("ArrowDown");
		await vi.waitFor(() => {
			expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
		});
	} finally {
		if (!original)
			delete (Element.prototype as { scrollIntoView?: unknown })
				.scrollIntoView;
		else
			Object.defineProperty(
				Element.prototype,
				"scrollIntoView",
				original
			);
	}
});

test("activeRowId pins the ring while the drawer is open, follows it, and stays on close", () => {
	// Models the drawer: ONE `open` signal drives both suppressFocus and the pin,
	// exactly as RosterTab does — so on close they flip together and the ring is
	// left where it landed rather than cleared.
	const [open, setOpen] = createSignal(false);
	const [person, setPerson] = createSignal<string | undefined>();
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			suppressFocus={open()}
			activeRowId={() => (open() ? person() : undefined)}
		/>
	));
	expect(focused()).toBeNull();

	// Drawer opens on Grace (id "b"): interaction suppressed, ring pinned to her.
	setPerson("b");
	setOpen(true);
	expect(focused()).toBe("Grace");

	// Page to Hedy ("c") via the drawer — the ring follows.
	setPerson("c");
	expect(focused()).toBe("Hedy");

	// Arrows are inert while the drawer owns them.
	press("ArrowUp");
	expect(focused()).toBe("Hedy");

	// Drawer closes — the ring STAYS on Hedy (not cleared, not reset to the top).
	// The ring shows only with focus in the table, so give it focus first.
	setOpen(false);
	grid().focus();
	expect(focused()).toBe("Hedy");

	// And arrows now move from where it landed.
	press("ArrowUp");
	expect(focused()).toBe("Grace");
});

test("with grouping, arrows walk the displayed order, not the flat column sort", () => {
	// The ring used to walk the flat sorted model. Grouped, the screen is
	// bucketed by the grouped column's own order, which diverges from the sort:
	// here group "a" renders first but its row scores 0, so a score-desc sort put
	// it LAST in the flat model — arrowing down from the top jumped straight past
	// it into group "b". The first press must land on what is visually first.
	type GroupedRow = {
		_id: string;
		band: string;
		score: number;
		name: string;
	};
	const groupedColumns: JfColumnDef<GroupedRow>[] = [
		{
			accessorKey: "band",
			header: "Band",
			dataType: "enum",
			enumOptions: [
				{ value: "a", label: "A" },
				{ value: "b", label: "B" },
			],
		},
		{ accessorKey: "score", header: "Score", dataType: "number" },
		{ accessorKey: "name", header: "Name", dataType: "string" },
	];
	const groupedData: GroupedRow[] = [
		// Group "a" renders first, but scores 0 → sorts last in a score-desc flat
		// model. Group "b" renders second, but scores 9 → sorts first.
		{ _id: "a1", band: "a", score: 0, name: "Anders" },
		{ _id: "b1", band: "b", score: 9, name: "Bianca" },
	];
	render(() => (
		<Table.Root
			columns={groupedColumns}
			data={groupedData}
			groupBy="band"
			focusableRows
			initialColumnSorting={[{ id: "score", desc: true }]}
		/>
	));
	press("ArrowDown");
	// Displayed-first is Anders (group "a"); the flat sort would have picked
	// Bianca (score 9). Focus follows the screen.
	expect(
		document.querySelector('tr[data-focused="true"]')?.textContent
	).toContain("Anders");
});

test("arrows move focus and stop at the ends", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	press("ArrowDown");
	press("ArrowDown");
	expect(focused()).toBe("Grace");
	press("ArrowUp");
	expect(focused()).toBe("Ada");
	press("ArrowUp");
	expect(focused()).toBe("Ada");
});

test("Enter activates the focused row", () => {
	const activated: string[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			onRowActivate={(row) => activated.push(row._id)}
		/>
	));
	press("ArrowDown");
	press("Enter");
	expect(activated).toEqual(["a"]);
});

test("arrows do nothing while typing in a field", () => {
	render(() => (
		<>
			<input data-testid="field" />
			<Table.Root columns={columns} data={data} focusableRows />
		</>
	));
	fireEvent.keyDown(screen.getByTestId("field"), { key: "ArrowDown" });
	expect(focused()).toBeNull();
});

test("checking a row clears focus and blocks it", async () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			enableRowSelection
		/>
	));
	press("ArrowDown");
	expect(focused()).toBe("Ada");
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	// Zag's checkbox machine dispatches `onCheckedChange` on a microtask (see
	// Checkbox.test.tsx), so the row selection - and the effect that clears
	// focus in response to it - lands a tick after the click, not synchronously.
	await vi.waitFor(() => {
		expect(focused()).toBeNull();
	});
	press("ArrowDown");
	expect(focused()).toBeNull();
});

test("onFocusedRowChange fires with the row the ring moved to", () => {
	const changes: (string | undefined)[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			onFocusedRowChange={(row) => changes.push(row?._id)}
		/>
	));
	press("ArrowDown");
	expect(changes).toEqual(["a"]);
	press("ArrowDown");
	expect(changes).toEqual(["a", "b"]);
});

test("onFocusedRowChange fires with undefined when a selection clears focus", async () => {
	const changes: (string | undefined)[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			enableRowSelection
			onFocusedRowChange={(row) => changes.push(row?._id)}
		/>
	));
	press("ArrowDown");
	expect(changes).toEqual(["a"]);
	fireEvent.click(screen.getAllByRole("checkbox")[1]);
	await vi.waitFor(() => {
		expect(changes).toEqual(["a", undefined]);
	});
});

test("a row with no _id is never marked focused", () => {
	type UnidentifiedRow = { name: string };
	const unidentifiedColumns: JfColumnDef<UnidentifiedRow>[] = [
		{ accessorKey: "name", header: "Name", dataType: "string" },
	];
	const unidentifiedData: UnidentifiedRow[] = [
		{ name: "Ada" },
		{ name: "Grace" },
	];
	render(() => (
		<Table.Root
			columns={unidentifiedColumns}
			data={unidentifiedData}
			focusableRows
		/>
	));
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
	press("ArrowDown");
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
	press("ArrowDown");
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
});

test("advance moves focus to whatever now holds the index", () => {
	const [rows, setRows] = createSignal<Row[]>(data);
	let api: { advance: () => void } | undefined;
	render(() => (
		<Table.Root
			columns={columns}
			data={rows()}
			focusableRows
			focusApi={(given) => (api = given)}
		/>
	));
	press("ArrowDown");
	press("ArrowDown");
	expect(focused()).toBe("Grace");
	// Grace is triaged away; Hedy takes index 1.
	setRows([data[0], data[2]]);
	api?.advance();
	expect(focused()).toBe("Hedy");
});

test("advance clamps to the last row when the tail is removed", () => {
	const [rows, setRows] = createSignal<Row[]>(data);
	let api: { advance: () => void } | undefined;
	render(() => (
		<Table.Root
			columns={columns}
			data={rows()}
			focusableRows
			focusApi={(given) => (api = given)}
		/>
	));
	press("ArrowDown");
	press("ArrowDown");
	press("ArrowDown");
	expect(focused()).toBe("Hedy");
	setRows([data[0], data[1]]);
	api?.advance();
	expect(focused()).toBe("Grace");
});

test("arrow/Enter keydown at a focused field is not preventDefaulted, even though the ring does not move", () => {
	// The field is not the grid, so the keystroke bubbles to the table with
	// `target !== currentTarget` and the table leaves it alone: the native effect
	// (moving a number field's value, a text caret, activating a focused button)
	// must survive. `fireEvent.keyDown` returns `dispatchEvent`'s own result:
	// `false` only when something called `preventDefault`.
	render(() => (
		<>
			<input data-testid="field" />
			<Table.Root columns={columns} data={data} focusableRows />
		</>
	));
	const field = screen.getByTestId("field");
	expect(fireEvent.keyDown(field, { key: "ArrowDown" })).toBe(true);
	expect(fireEvent.keyDown(field, { key: "ArrowUp" })).toBe(true);
	expect(fireEvent.keyDown(field, { key: "Enter" })).toBe(true);
	// And the ring still never moved — the typing guard, not preventDefault, is
	// what is keeping the table out of the field's way.
	expect(focused()).toBeNull();
});

test("advance never focuses a row with no usable id", () => {
	type UnidentifiedRow = { name: string };
	const unidentifiedColumns: JfColumnDef<UnidentifiedRow>[] = [
		{ accessorKey: "name", header: "Name", dataType: "string" },
	];
	const unidentifiedData: UnidentifiedRow[] = [
		{ name: "Ada" },
		{ name: "Grace" },
	];
	let api: { advance: () => void } | undefined;
	render(() => (
		<Table.Root
			columns={unidentifiedColumns}
			data={unidentifiedData}
			focusableRows
			focusApi={(given) => (api = given)}
		/>
	));
	press("ArrowDown");
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
	api?.advance();
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
});

test("ArrowDown suppresses the browser default on the acting path", () => {
	// The handler owns cancelling the keystroke itself — this is what stops the
	// page scrolling while the ring moves. `fireEvent.keyDown` returns
	// `dispatchEvent`'s own result: `false` only when something called
	// `preventDefault`.
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	grid().focus();
	expect(fireEvent.keyDown(grid(), { key: "ArrowDown" })).toBe(false);
});

test("ArrowUp suppresses the browser default on the acting path", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	press("ArrowDown");
	press("ArrowDown");
	expect(focused()).toBe("Grace");
	expect(fireEvent.keyDown(grid(), { key: "ArrowUp" })).toBe(false);
});

test("Enter on a button outside the table does not activate the ringed row", () => {
	const activated: string[] = [];
	render(() => (
		<>
			<button type="button">Outside</button>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				autofocusFirstRow
				onRowActivate={(row) => activated.push(row._id)}
			/>
		</>
	));
	const outside = screen.getByRole("button", { name: "Outside" });
	outside.focus();
	fireEvent.keyDown(outside, { key: "Enter" });
	expect(activated).toEqual([]);
});

test("Enter on a button inside a row does not activate that row", () => {
	const activated: string[] = [];
	const withAction: JfColumnDef<Row>[] = [
		...columns,
		{
			id: "actions",
			header: "",
			dataType: "string",
			cell: () => <button type="button">Act</button>,
		},
	];
	render(() => (
		<Table.Root
			columns={withAction}
			data={data}
			focusableRows
			autofocusFirstRow
			onRowActivate={(row) => activated.push(row._id)}
		/>
	));
	const act = screen.getAllByRole("button", { name: "Act" })[0];
	act.focus();
	fireEvent.keyDown(act, { key: "Enter" });
	expect(activated).toEqual([]);
});

test("aria-activedescendant points at the ringed row", () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			autofocusFirstRow
		/>
	));
	const first = document.getElementById(
		grid().getAttribute("aria-activedescendant") ?? ""
	);
	expect(first?.textContent).toContain("Ada");
	press("ArrowDown");
	const second = document.getElementById(
		grid().getAttribute("aria-activedescendant") ?? ""
	);
	expect(second?.textContent).toContain("Grace");
});

test("a table that is not focusable is a plain table with no tab stop", () => {
	render(() => <Table.Root columns={columns} data={data} />);
	expect(screen.queryByRole("grid")).toBeNull();
	expect(screen.getByRole("table").hasAttribute("tabindex")).toBe(false);
});

test("going live claims focus", async () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			autofocusFirstRow
		/>
	));
	await Promise.resolve();
	expect(document.activeElement).toBe(grid());
});

// The keyboard-focused-tab exception cannot be tested here: jsdom never matches
// `:focus-visible`, so a focused tab always reads as mouse-focused. It is checked
// in a real browser.
test("going live does not take focus from a text field", async () => {
	const [suppressed, setSuppressed] = createSignal(true);
	render(() => (
		<>
			<input aria-label="Search" />
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				suppressFocus={suppressed()}
			/>
		</>
	));
	const search = screen.getByRole("textbox", { name: "Search" });
	search.focus();
	setSuppressed(false);
	await Promise.resolve();
	expect(document.activeElement).toBe(search);
});

test("closing the drawer (pin released) hands focus back to the table", async () => {
	const [pinned, setPinned] = createSignal<string | undefined>("b");
	render(() => (
		<>
			<button type="button">In drawer</button>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				suppressFocus={pinned() !== undefined}
				activeRowId={pinned}
			/>
		</>
	));
	screen.getByRole("button", { name: "In drawer" }).focus();
	setPinned(undefined);
	await Promise.resolve();
	expect(document.activeElement).toBe(grid());
	expect(focused()).toBe("Grace");
});

test("ArrowDown on a focused tab steps into the live table", () => {
	render(() => (
		<>
			<div role="tablist">
				<button type="button" role="tab">
					Tab
				</button>
			</div>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				autofocusFirstRow
			/>
		</>
	));
	const tab = screen.getByRole("tab");
	tab.focus();
	fireEvent.keyDown(tab, { key: "ArrowDown" });
	expect(document.activeElement).toBe(grid());
	expect(focused()).toBe("Ada");
});

test("ArrowDown on a focused tab of a vertical tablist does not step in", () => {
	render(() => (
		<>
			<div role="tablist" aria-orientation="vertical">
				<button type="button" role="tab">
					Tab
				</button>
			</div>
			<Table.Root columns={columns} data={data} focusableRows />
		</>
	));
	const tab = screen.getByRole("tab");
	tab.focus();
	expect(fireEvent.keyDown(tab, { key: "ArrowDown" })).toBe(true);
	expect(document.activeElement).toBe(tab);
});

test("Enter with nothing focused focuses the grid without activating, the next Enter activates", async () => {
	const activated: string[] = [];
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			autofocusFirstRow
			onRowActivate={(row) => activated.push(row._id)}
		/>
	));
	await Promise.resolve();
	(document.activeElement as HTMLElement).blur();
	expect(document.activeElement).toBe(document.body);
	expect(focused()).toBeNull();
	expect(fireEvent.keyDown(document.body, { key: "Enter" })).toBe(false);
	expect(document.activeElement).toBe(grid());
	expect(activated).toEqual([]);
	// The ring was hidden, so this first key only revealed it.
	expect(focused()).toBe("Ada");
	fireEvent.keyDown(grid(), { key: "Enter" });
	expect(activated).toEqual(["a"]);
});

test("ArrowDown with nothing focused focuses the grid without moving the ring", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	press("ArrowDown");
	press("ArrowDown");
	expect(focused()).toBe("Grace");
	grid().blur();
	expect(focused()).toBeNull();
	fireEvent.keyDown(document.body, { key: "ArrowDown" });
	expect(document.activeElement).toBe(grid());
	expect(focused()).toBe("Grace");
});

test("keys with nothing focused are left alone when modified, unrelated, or the table is not on screen", () => {
	render(() => <Table.Root columns={columns} data={data} focusableRows />);
	expect(fireEvent.keyDown(document.body, { key: "x" })).toBe(true);
	expect(
		fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true })
	).toBe(true);
	expect(document.activeElement).toBe(document.body);
	grid().checkVisibility = () => false;
	expect(fireEvent.keyDown(document.body, { key: "Enter" })).toBe(true);
	expect(document.activeElement).toBe(document.body);
});

test("the ring hides when a focused node is removed with no focusout", async () => {
	// Chrome (and jsdom) fire no focusout for a removed focused node, so the
	// table must re-read focus from the DOM when the next key arrives.
	const withAction: JfColumnDef<Row>[] = [
		...columns,
		{
			id: "actions",
			header: "",
			dataType: "string",
			cell: () => <button type="button">Act</button>,
		},
	];
	render(() => (
		<Table.Root
			columns={withAction}
			data={data}
			focusableRows
			autofocusFirstRow
		/>
	));
	await Promise.resolve();
	const act = screen.getAllByRole("button", { name: "Act" })[0];
	act.focus();
	expect(document.querySelector('tr[data-focused="true"]')).not.toBeNull();
	act.remove();
	expect(document.activeElement).toBe(document.body);
	fireEvent.keyDown(document.body, { key: "x" });
	expect(document.querySelector('tr[data-focused="true"]')).toBeNull();
});

test("the ring shows only while focus is within the table", async () => {
	render(() => (
		<>
			<button type="button">Outside</button>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				autofocusFirstRow
			/>
		</>
	));
	await Promise.resolve();
	expect(focused()).toBe("Ada");
	screen.getByRole("button", { name: "Outside" }).focus();
	expect(focused()).toBeNull();
	grid().focus();
	expect(focused()).toBe("Ada");
});

test("leaving the table reports no focused row, and returning reports it again", async () => {
	const seen: (string | undefined)[] = [];
	render(() => (
		<>
			<button type="button">Outside</button>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				autofocusFirstRow
				onFocusedRowChange={(row) => seen.push(row?._id)}
			/>
		</>
	));
	await Promise.resolve();
	screen.getByRole("button", { name: "Outside" }).focus();
	grid().focus();
	expect(seen).toEqual(["a", undefined, "a"]);
});

test("a pinned ring shows while focus is in the drawer", () => {
	render(() => (
		<>
			<button type="button">In drawer</button>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				suppressFocus
				activeRowId={() => "c"}
			/>
		</>
	));
	screen.getByRole("button", { name: "In drawer" }).focus();
	expect(focused()).toBe("Hedy");
});

test("going live does not pull focus off a control already inside the table", async () => {
	render(() => (
		<Table.Root
			columns={columns}
			data={data}
			focusableRows
			enableRowSelection
		/>
	));
	const checkbox = screen.getAllByRole("checkbox")[1];
	fireEvent.click(checkbox);
	await vi.waitFor(() => {
		expect(
			document.querySelectorAll('tr[data-state="selected"]')
		).toHaveLength(1);
	});
	checkbox.focus();
	// Unchecking the last checked row empties the selection, which makes the
	// table live again.
	fireEvent.click(checkbox);
	await vi.waitFor(() => {
		expect(
			document.querySelectorAll('tr[data-state="selected"]')
		).toHaveLength(0);
	});
	await Promise.resolve();
	expect(document.activeElement).toBe(checkbox);
});

test("aria-activedescendant is dropped when the ringed row has left the table", async () => {
	const [rows, setRows] = createSignal<Row[]>(data);
	const [pinned, setPinned] = createSignal<string | undefined>("b");
	render(() => (
		<Table.Root
			columns={columns}
			data={rows()}
			focusableRows
			suppressFocus={pinned() !== undefined}
			activeRowId={pinned}
		/>
	));
	expect(grid().getAttribute("aria-activedescendant")).not.toBeNull();
	setPinned(undefined);
	await Promise.resolve();
	expect(grid().getAttribute("aria-activedescendant")).not.toBeNull();
	setRows([data[0], data[2]]);
	expect(grid().getAttribute("aria-activedescendant")).toBeNull();
});

test("a table inside an inert subtree does not take focus from a stray Enter", async () => {
	render(() => (
		<div inert>
			<Table.Root columns={columns} data={data} focusableRows />
		</div>
	));
	await Promise.resolve();
	expect(document.activeElement).toBe(document.body);
	expect(fireEvent.keyDown(document.body, { key: "Enter" })).toBe(true);
	await Promise.resolve();
	expect(document.activeElement).toBe(document.body);
});

test("with two live visible tables, a stray Enter focuses only the first", async () => {
	render(() => (
		<>
			<Table.Root columns={columns} data={data} focusableRows />
			<Table.Root columns={columns} data={data} focusableRows />
		</>
	));
	await Promise.resolve();
	const [first, second] = screen.getAllByRole("grid");
	(document.activeElement as HTMLElement).blur();
	expect(document.activeElement).toBe(document.body);
	expect(fireEvent.keyDown(document.body, { key: "Enter" })).toBe(false);
	expect(document.activeElement).toBe(first);
	expect(document.activeElement).not.toBe(second);
});

test("a getRowId keys focus for data with no _id", () => {
	type Plain = { name: string };
	render(() => (
		<Table.Root
			columns={[
				{ accessorKey: "name", header: "Name", dataType: "string" },
			]}
			data={[{ name: "Ada" }, { name: "Grace" }] satisfies Plain[]}
			getRowId={(row) => row.name}
			focusableRows
			activeRowId={() => "Grace"}
		/>
	));
	grid().focus();
	expect(focused()).toBe("Grace");
});

test("arrows focus rows a getRowId keys", () => {
	render(() => (
		<Table.Root
			columns={[
				{ accessorKey: "name", header: "Name", dataType: "string" },
			]}
			data={[{ name: "Ada" }, { name: "Grace" }]}
			getRowId={(row) => row.name}
			focusableRows
		/>
	));
	press("ArrowDown");
	expect(focused()).toBe("Ada");
});

test("rows with neither an _id nor a getRowId are never focused", () => {
	render(() => (
		<Table.Root
			columns={[
				{ accessorKey: "name", header: "Name", dataType: "string" },
			]}
			data={[{ name: "Ada" }, { name: "Grace" }]}
			focusableRows
		/>
	));
	press("ArrowDown");
	expect(focused()).toBeNull();
});
