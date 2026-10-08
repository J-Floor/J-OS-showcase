import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Show, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";

import { Table } from "../Table/Table.tsx";
import type { JfColumnDef } from "../Table/types.ts";

import { DrawerNav } from "./DrawerNav.tsx";

/**
 * `Table`'s row-focus ring and `DrawerNav`'s prev/next both bind ArrowUp/
 * ArrowDown. The table's keys are scoped to its own focused grid, the drawer's
 * to its own panel. With a drawer open over the roster, an ArrowDown meant to
 * step to the next PERSON must not also crawl the ring one row down underneath
 * it. Proven here against the real `Table` this app pairs `DrawerNav` with.
 */

type Row = { _id: string; name: string };
const columns: JfColumnDef<Row>[] = [
	{ accessorKey: "name", header: "Name", dataType: "string" },
];
const data: Row[] = [
	{ _id: "a", name: "Ada" },
	{ _id: "b", name: "Grace" },
];

function focusedRingId(): string | null {
	const row = document.querySelector('tr[data-focused="true"]');
	return row?.querySelector("td:last-child")?.textContent ?? null;
}

/** The table plus a drawer panel that may or may not be open, both wired the
 *  way the community tabs actually wire them. */
function Scene(props: { drawerOpen: boolean; onNext?: () => void }) {
	const [focused, setFocused] = createSignal<Row>();
	return (
		<>
			<Table.Root
				columns={columns}
				data={data}
				focusableRows
				onFocusedRowChange={setFocused}
			/>
			<Show when={props.drawerOpen}>
				<div data-scope="dialog" data-part="content">
					<button type="button" data-testid="in-drawer">
						Something focusable in the drawer
					</button>
					<DrawerNav
						onPrev={() => {}}
						onNext={() => props.onNext?.()}
						hasPrev={false}
						hasNext
					/>
				</div>
			</Show>
			<span data-testid="ring">{focused()?._id}</span>
		</>
	);
}

test("with a drawer open, ArrowDown steps the drawer and does not move the table's focus ring", () => {
	// Under the old document-level keys this proved the drawer's scoped hotkey
	// stopped the event reaching the table. The table now only hears keys aimed
	// at its own grid, and the drawer panel is not inside it, so the collision
	// cannot happen by construction. The test still pins the observable result:
	// the ring, put on the first row by an arrow on the grid, stays put while
	// the drawer's Next fires.
	const onNext = vi.fn();
	render(() => <Scene drawerOpen onNext={onNext} />);
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Ada");
	const inDrawer = screen.getByTestId("in-drawer");
	expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();

	fireEvent.keyDown(inDrawer, { key: "ArrowDown" });
	expect(onNext).toHaveBeenCalledTimes(1);
	expect(focusedRingId()).toBe("Ada");
});

test("with no drawer open, ArrowDown moves the ring as before", () => {
	render(() => <Scene drawerOpen={false} />);
	const grid = screen.getByRole("grid");
	grid.focus();
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Ada");
	fireEvent.keyDown(grid, { key: "ArrowDown" });
	expect(focusedRingId()).toBe("Grace");
});
