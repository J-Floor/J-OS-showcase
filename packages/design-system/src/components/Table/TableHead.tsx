/**
 * `Table.Root`'s header: one row per header group, each column header with
 * its sort and filter buttons, and the select-all checkbox over a selection
 * column.
 */
import {
	flexRender,
	type Column,
	type Header,
	type Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import { type JSX, For, Show } from "solid-js";

import { Checkbox } from "../Checkbox/Checkbox.tsx";

import { ACTIONS_COLUMN_ID, SELECT_COLUMN_ID } from "./columnTracks.ts";
import {
	COLUMN_ID_ATTR,
	HEADER_ACTIONS_ATTR,
	HEADER_CELL_ATTR,
	HEADER_LABEL_ATTR,
} from "./domContract.ts";
import { FilteringButton } from "./FilteringButton.tsx";
import { SortingButton } from "./SortingButton.tsx";
import styles from "./Table.module.scss";

/** `aria-sort` for a header: its sort state, or nothing when it cannot sort. */
function ariaSort<Data extends Record<string, unknown>>(
	column: Column<Data>
): "ascending" | "descending" | "none" | undefined {
	if (!column.getCanSort()) return undefined;
	const sorted = column.getIsSorted();
	if (sorted === "asc") return "ascending";
	return sorted === "desc" ? "descending" : "none";
}

function renderHeaderCell<Data extends Record<string, unknown>>(
	table: TanTable<Data>,
	header: Header<Data, unknown>
): JSX.Element {
	const column = header.column;
	const isSelect = column.id === SELECT_COLUMN_ID;
	const isActions = column.id === ACTIONS_COLUMN_ID;
	return (
		<th
			class={clsx(styles.th, isActions && styles.actionsCell)}
			role="columnheader"
			scope="col"
			aria-sort={ariaSort(column)}
			{...{ [COLUMN_ID_ATTR]: column.id }}
		>
			<Show
				when={isSelect}
				fallback={
					<span
						class={styles.headerCell}
						{...{ [HEADER_CELL_ATTR]: "" }}
					>
						<span
							class={styles.headerLabel}
							{...{ [HEADER_LABEL_ATTR]: "" }}
						>
							{flexRender(
								column.columnDef.header,
								header.getContext()
							)}
						</span>
						<span
							class={styles.headerActions}
							{...{ [HEADER_ACTIONS_ATTR]: "" }}
						>
							<Show when={column.getCanSort()}>
								<SortingButton column={column} table={table} />
							</Show>
							<Show when={column.getCanFilter()}>
								<FilteringButton column={column} />
							</Show>
						</span>
					</span>
				}
			>
				<span class={clsx(styles.headerCell, styles.selectCell)}>
					<Checkbox
						checked={
							table.getIsAllRowsSelected() ||
							(table.getIsSomeRowsSelected() && "indeterminate")
						}
						onCheckedChange={() => {
							table.toggleAllRowsSelected();
						}}
					/>
				</span>
			</Show>
		</th>
	);
}

export function TableHead<Data extends Record<string, unknown>>(props: {
	table: TanTable<Data>;
}): JSX.Element {
	return (
		<thead role="rowgroup">
			<For each={props.table.getHeaderGroups()}>
				{(headerGroup) => (
					<tr role="row">
						<For each={headerGroup.headers}>
							{(header) => renderHeaderCell(props.table, header)}
						</For>
					</tr>
				)}
			</For>
		</thead>
	);
}
