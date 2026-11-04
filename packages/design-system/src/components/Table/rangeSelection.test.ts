import type { Row, RowSelectionState } from "@tanstack/solid-table";
import { createSignal } from "solid-js";
import { expect, test, vi } from "vitest";

import { createRangeSelection } from "./rangeSelection.ts";

type Data = Record<string, unknown>;

const toggles = new Map<string, ReturnType<typeof vi.fn>>();

function fakeRow(id: string) {
	const toggleSelected = vi.fn();
	toggles.set(id, toggleSelected);
	return { id, toggleSelected } as unknown as Row<Data>;
}

function click(isShifted: boolean) {
	const preventDefault = vi.fn();
	return {
		event: { shiftKey: isShifted, preventDefault } as unknown as MouseEvent,
		preventDefault,
	};
}

function setup(ids: string[]) {
	const rows = ids.map((id) => fakeRow(id));
	const [selection, setRowSelection] = createSignal<RowSelectionState>({});
	const [rendered, setRendered] = createSignal(rows);
	const range = createRangeSelection<Data>({
		rows: rendered,
		setRowSelection,
	});
	return { rows, selection, setRendered, range };
}

test("a plain toggle toggles that row only", () => {
	const { rows, selection, range } = setup(["a", "b", "c"]);
	range.onCheckedChange(rows[1]);
	expect(toggles.get("b")).toHaveBeenCalledOnce();
	expect(toggles.get("a")).not.toHaveBeenCalled();
	expect(selection()).toEqual({});
});

test("shift-click selects every row between the last toggled row and the clicked one", () => {
	const { rows, selection, range } = setup(["a", "b", "c", "d", "e"]);
	range.onCheckedChange(rows[1]);
	const { event, preventDefault } = click(true);
	range.onCheckboxClick(rows[3], event);
	expect(selection()).toEqual({ b: true, c: true, d: true });
	expect(preventDefault).toHaveBeenCalledOnce();
});

test("shift-click works upwards too, and keeps the rows already selected", () => {
	const { rows, selection, range } = setup(["a", "b", "c", "d"]);
	range.onCheckedChange(rows[3]);
	range.onCheckboxClick(rows[1], click(true).event);
	expect(selection()).toEqual({ b: true, c: true, d: true });
});

test("a second shift-click extends from the row just clicked", () => {
	const { rows, selection, range } = setup(["a", "b", "c", "d", "e"]);
	range.onCheckedChange(rows[0]);
	range.onCheckboxClick(rows[1], click(true).event);
	range.onCheckboxClick(rows[3], click(true).event);
	expect(selection()).toEqual({ a: true, b: true, c: true, d: true });
});

test("the range follows the rendered order, not the original order", () => {
	const { rows, selection, setRendered, range } = setup(["a", "b", "c", "d"]);
	setRendered([rows[3], rows[0], rows[2], rows[1]]);
	range.onCheckedChange(rows[3]);
	range.onCheckboxClick(rows[2], click(true).event);
	expect(selection()).toEqual({ d: true, a: true, c: true });
});

test("a shift-click with no earlier toggle is left to the checkbox", () => {
	const { rows, selection, range } = setup(["a", "b"]);
	const { event, preventDefault } = click(true);
	range.onCheckboxClick(rows[1], event);
	expect(preventDefault).not.toHaveBeenCalled();
	expect(selection()).toEqual({});
});

test("a click without shift is left to the checkbox", () => {
	const { rows, selection, range } = setup(["a", "b", "c"]);
	range.onCheckedChange(rows[0]);
	const { event, preventDefault } = click(false);
	range.onCheckboxClick(rows[2], event);
	expect(preventDefault).not.toHaveBeenCalled();
	expect(selection()).toEqual({});
});

test("a shift-click selects nothing when the anchor row is no longer rendered", () => {
	const { rows, selection, setRendered, range } = setup(["a", "b", "c"]);
	range.onCheckedChange(rows[0]);
	setRendered([rows[1], rows[2]]);
	range.onCheckboxClick(rows[2], click(true).event);
	expect(selection()).toEqual({});
});
