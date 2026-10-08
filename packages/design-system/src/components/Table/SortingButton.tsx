import type {
	Column,
	SortDirection,
	Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import { type JSX, Show } from "solid-js";

import { Icon } from "../Icon/Icon.tsx";
import iconButtonStyles from "../IconButton/IconButton.module.scss";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import { columnLabel } from "./columnLabel.ts";
import styles from "./Table.module.scss";

type SortKey = SortDirection | "false";

const sortingConfig: Record<
	SortKey,
	{ tooltip: string; icon: string; active: boolean }
> = {
	asc: { tooltip: "Sorted ascending", icon: "expand_more", active: true },
	desc: { tooltip: "Sorted descending", icon: "expand_less", active: true },
	false: { tooltip: "Not sorted", icon: "unfold_more", active: false },
};

/**
 * Toggles a column's sort state. Ported from EmboUI's `SortingButton`
 * (`@tanstack/react-table` → `@tanstack/solid-table`).
 *
 * Its accessible name says which column it sorts ("Sort by Name"), since
 * every header carries the same icon; the tooltip shows the current state,
 * and the header cell's `aria-sort` tells assistive tech the same. A plain
 * button inside the Tooltip trigger rather than an `IconButton`, whose
 * accessible name is always its tooltip label.
 *
 * When MORE than one column is sorted (shift-click adds to the multi-sort), a
 * small `counter_N` badge shows this column's 1-based position in the sort
 * order. Hidden for single-column sorts (the position is unambiguous).
 */
export function SortingButton<Data extends Record<string, unknown>>(props: {
	column: Column<Data>;
	table: TanTable<Data>;
}): JSX.Element {
	function state(): SortKey {
		return String(props.column.getIsSorted()) as SortKey;
	}
	function config(): { tooltip: string; icon: string; active: boolean } {
		return sortingConfig[state()];
	}
	// 1-based sort position, shown only under multi-column sort. `getSortIndex`
	// is -1 when this column is not part of the sort.
	function sortOrder(): number | null {
		const total = props.table.getState().sorting.length;
		if (total < 2) return null;
		const index = props.column.getSortIndex();
		return index >= 0 ? index + 1 : null;
	}

	return (
		<span class={styles.sortWrap}>
			<Tooltip
				tooltipContent={config().tooltip}
				asChild={(tooltipProps) => (
					<button
						type="button"
						{...(tooltipProps() as object)}
						aria-label={`Sort by ${columnLabel(props.column)}`}
						class={clsx(
							iconButtonStyles.iconButton,
							config().active && styles.sortActive
						)}
						onClick={(event) =>
							props.column.getToggleSortingHandler()?.(event)
						}
					>
						<Icon>{config().icon}</Icon>
					</button>
				)}
			/>
			<Show when={sortOrder()}>
				{(order) => (
					<span class={styles.sortOrder} aria-hidden="true">
						<Icon>{`counter_${String(order())}`}</Icon>
					</span>
				)}
			</Show>
		</span>
	);
}
