/**
 * Checkbox row selection for `Table.Root`: a click toggles one row, a
 * shift-click selects every row between it and the last one toggled.
 */
import type { Row as TanRow, RowSelectionState } from "@tanstack/solid-table";
import type { Setter } from "solid-js";

export type RangeSelection<Data extends Record<string, unknown>> = {
	/** A selection checkbox's click: a shift-click selects the range. */
	onCheckboxClick: (row: TanRow<Data>, event: MouseEvent) => void;
	/** A selection checkbox's plain toggle. */
	onCheckedChange: (row: TanRow<Data>) => void;
};

export function createRangeSelection<
	Data extends Record<string, unknown>,
>(options: {
	/** The leaf rows in the order they render on screen. */
	rows: () => TanRow<Data>[];
	setRowSelection: Setter<RowSelectionState>;
}): RangeSelection<Data> {
	// Id of the last toggled leaf row, anchor for shift-click range selection.
	// Tracked by id (not `row.index`, which is the original data index): the
	// range must follow the *rendered* order so it stays contiguous under
	// sorting/grouping.
	let lastSelectedId: string | null = null;

	function toggleRangeTo(targetId: string) {
		// Range must follow the on-screen order. When grouped, rows render in
		// `rowGroups()` order (bucketed by group, ordered by the grouped column's
		// enumOptions) — NOT `getRowModel()`'s flat sorted order — and collapsed
		// groups are hidden, so walk the same visible-and-ordered list here or a
		// shift-range across groups skips/keeps the wrong rows.
		const rows = options.rows();
		const targetPos = rows.findIndex((row) => row.id === targetId);
		const anchorPos =
			lastSelectedId === null
				? targetPos
				: rows.findIndex((row) => row.id === lastSelectedId);
		if (targetPos === -1 || anchorPos === -1) return;
		const start = Math.min(anchorPos, targetPos);
		const end = Math.max(anchorPos, targetPos);
		const ids = rows.slice(start, end + 1).map((row) => row.id);
		options.setRowSelection((prev) => {
			const next = { ...prev };
			for (const id of ids) next[id] = true;
			return next;
		});
	}

	return {
		onCheckboxClick: (row, event) => {
			if (!(event.shiftKey && lastSelectedId !== null)) {
				return;
			}

			event.preventDefault();
			toggleRangeTo(row.id);
			lastSelectedId = row.id;
		},
		onCheckedChange: (row) => {
			row.toggleSelected();
			lastSelectedId = row.id;
		},
	};
}
