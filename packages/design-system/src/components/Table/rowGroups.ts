/**
 * The table's grouping, built by `createTableModel` (Table.tsx): rows bucketed by the `groupBy` column, groups
 * ordered by that column's enum options, which groups are collapsed, and the
 * leaf rows in the order they render on screen.
 */
import type { Row as TanRow, Table as TanTable } from "@tanstack/solid-table";
import { type Accessor, createMemo, createSignal } from "solid-js";

import { enumOptionLabel, enumOptionValues } from "./filter.ts";
import { columnMeta } from "./hooks.ts";
import type { TableRootProps } from "./Table.tsx";
import type { EnumOption, EnumValue } from "./types.ts";

export type RowGroup<Data extends Record<string, unknown>> = {
	key: string;
	value: unknown;
	rows: TanRow<Data>[];
};

// Group headers and data rows are interleaved in ONE list so the virtualiser
// measures what is actually on screen. Keeping them in separate lists (or
// virtualising each group's rows independently) means the spacer heights and
// the sticky header stop agreeing with each other as soon as a group is
// collapsed.
export type RenderItem<Data extends Record<string, unknown>> =
	| { kind: "group"; group: RowGroup<Data> }
	| { kind: "row"; row: TanRow<Data> };

export type RowGroups<Data extends Record<string, unknown>> = {
	rowGroups: () => RowGroup<Data>[];
	isGroupExpanded: (key: string) => boolean;
	toggleGroup: (key: string) => void;
	groupLabel: (value: unknown) => string;
	displayedLeafRows: () => TanRow<Data>[];
};

/** The grouped column's enum options, which name and order the groups. */
function groupOptions<Data extends Record<string, unknown>>(
	props: Pick<TableRootProps<Data>, "groupBy">,
	table: TanTable<Data>
): readonly EnumOption<EnumValue>[] | undefined {
	if (!props.groupBy) return undefined;
	const column = table.getColumn(props.groupBy);
	if (!column) return undefined;
	const meta = columnMeta(column);
	return meta.dataType === "enum" ? meta.enumOptions : undefined;
}

// Bucket the flat, sorted+filtered rows by the grouped column's value. Group
// ORDER follows the grouped column's `enumOptions` order (so it is stable and
// independent of the row sort); unknown values fall back to first-seen order.
function bucketRows<Data extends Record<string, unknown>>(
	props: Pick<TableRootProps<Data>, "groupBy">,
	table: TanTable<Data>
): RowGroup<Data>[] {
	const groupBy = props.groupBy;
	if (!groupBy) return [];
	const order: string[] = [];
	const byKey = new Map<string, RowGroup<Data>>();
	for (const row of table.getRowModel().rows) {
		const value = row.getValue(groupBy);
		const key = String(value);
		let group = byKey.get(key);
		if (!group) {
			group = { key, value, rows: [] };
			byKey.set(key, group);
			order.push(key);
		}
		group.rows.push(row);
	}
	const options = groupOptions(props, table);
	if (options) {
		const rank = new Map(
			options.flatMap((option, index) =>
				enumOptionValues(option).map((value) => [value, index] as const)
			)
		);
		order.sort(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			(a, b) =>
				(rank.get(a) ?? Number.POSITIVE_INFINITY) -
				(rank.get(b) ?? Number.POSITIVE_INFINITY)
		);
	}
	return order.map((key) => byKey.get(key)!);
}

export function createRowGroups<Data extends Record<string, unknown>>(options: {
	props: Pick<TableRootProps<Data>, "groupBy">;
	table: TanTable<Data>;
}): RowGroups<Data> {
	const { props, table } = options;

	// Collapsed group keys. Groups start expanded (empty set); toggling a group
	// header adds/removes its key. Created ahead of `createGridFocus`: the
	// ring's memo reads the displayed rows as it is created, and those depend
	// on which groups are collapsed.
	const [collapsedGroups, setCollapsedGroups] = createSignal<Set<string>>(
		new Set()
	);

	function rowGroups(): RowGroup<Data>[] {
		return bucketRows(props, table);
	}

	function groupLabel(value: unknown): string {
		return enumOptionLabel(groupOptions(props, table) ?? [], String(value));
	}

	// Grouped rows render in ONE table (header, group-header rows and data rows
	// share one track list), so the leading select column and the group
	// indicator line up inherently and the trailing actions column can be sticky.
	function isGroupExpanded(key: string): boolean {
		return !collapsedGroups().has(key);
	}
	function toggleGroup(key: string) {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	// Leaf rows in the exact order they render on screen: grouped + group-ordered
	// and excluding collapsed (hidden) groups, else the flat sorted model. Used by
	// shift-click range selection so the range matches what the user sees, and
	// by the focus ring, so arrowing moves the way the eye reads.
	function displayedLeafRows(): TanRow<Data>[] {
		return props.groupBy
			? rowGroups()
					.filter((group) => isGroupExpanded(group.key))
					.flatMap((group) => group.rows)
			: table.getRowModel().rows.filter((row) => !row.getIsGrouped());
	}

	return {
		rowGroups,
		isGroupExpanded,
		toggleGroup,
		groupLabel,
		displayedLeafRows,
	};
}

/**
 * The virtual body's list: each group's header, followed by its rows while
 * it is expanded.
 *
 * Memoised so an item's identity is stable while nothing has changed. The
 * virtual body keys off that identity to decide when to re-render a row, so
 * rebuilding the array on every read would make every row re-render on
 * every tick.
 */
export function createRenderItems<Data extends Record<string, unknown>>(
	groups: RowGroups<Data>
): Accessor<RenderItem<Data>[]> {
	const renderItems = createMemo<RenderItem<Data>[]>(() => {
		const items: RenderItem<Data>[] = [];
		for (const group of groups.rowGroups()) {
			items.push({ kind: "group", group });
			if (groups.isGroupExpanded(group.key))
				for (const row of group.rows) items.push({ kind: "row", row });
		}
		return items;
	});
	return renderItems;
}
