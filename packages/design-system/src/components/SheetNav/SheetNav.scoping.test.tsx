import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Show, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";

import { Table } from "../Table/Table.tsx";
import { rowId } from "../Table/testRowIds.ts";
import type { JfColumnDefinition } from "../Table/types.ts";

import { SheetNav } from "./SheetNav.tsx";

/**
 * `Table`'s row-focus ring and `SheetNav`'s prev/next both bind ArrowUp/
 * ArrowDown. The table's keys are scoped to its own focused grid, the sheet's
 * to its own panel. With a sheet open over a table, an ArrowDown meant to
 * step to the next ROW's sheet must not also crawl the ring one row down
 * underneath it. Proven here against the real `Table` `SheetNav` pairs with.
 */

type Row = { id: string; name: string };
const columns: JfColumnDefinition<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
];
const data: Row[] = [
	{ id: "a", name: "Ada" },
	{ id: "b", name: "Grace" },
];

function focusedRingId(): string | null {
	const row = document.querySelector('tr[data-focused="true"]');
	return row?.querySelector("td:last-child")?.textContent ?? null;
}

/** The table plus a sheet panel that may or may not be open, wired the way a
 *  list page with a detail sheet wires them. */
function Scene(props: { sheetOpen: boolean; onNext?: () => void }) {
	const [focused, setFocused] = createSignal<Row>();
	return (
		<>
			<Table.Root
				columns={columns}
				data={data}
				getRowId={rowId}
				focusableRows
				onFocusedRowChange={setFocused}
			/>
			<Show when={props.sheetOpen}>
				<div data-scope="dialog" data-part="content">
					<button type="button" data-testid="in-sheet">
						Something focusable in the sheet
					</button>
					<SheetNav
						onPrev={() => {}}
						onNext={() => props.onNext?.()}
						hasPrev={false}
						hasNext
					/>
				</div>
			</Show>
			<span data-testid="ring">{focused()?.id}</span>
		</>
	);
}

test("with a sheet open, ArrowDown steps the sheet and does not move the table's focus ring", () => {
	// Under the old document-level keys this proved the sheet's scoped hotkey
	// stopped the event reaching the table. The table now only hears keys aimed
	// at its own grid, and the sheet panel is not inside it, so the collision
	// cannot happen by construction. The test still pins the observable result:
	// the ring, put on the first row by an arrow on the grid, stays put while
	// the sheet's Next fires.
	const onNext = vi.fn();
	render(() => <Scene sheetOpen onNext={onNext} />);
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Ada");
	const inSheet = screen.getByTestId("in-sheet");
	expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();

	fireEvent.keyDown(inSheet, { key: "ArrowDown" });
	expect(onNext).toHaveBeenCalledTimes(1);
	expect(focusedRingId()).toBe("Ada");
});

test("with no sheet open, ArrowDown moves the ring as before", () => {
	render(() => <Scene sheetOpen={false} />);
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Ada");
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Grace");
});
