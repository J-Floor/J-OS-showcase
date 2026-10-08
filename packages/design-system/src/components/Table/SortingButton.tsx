import type {
	Column,
	SortDirection,
	Table as TanTable,
} from "@tanstack/solid-table";
import { type JSX, Show } from "solid-js";

import { Icon } from "../Icon/Icon.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";

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
 * (`@tanstack/react-table` → `@tanstack/solid-table`); rendered as an
 * {@link IconButton} whose ligature reflects the current sort direction.
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
			<IconButton
				tooltipLabel={config().tooltip}
				class={config().active ? styles.sortActive : undefined}
				onClick={(event) =>
					props.column.getToggleSortingHandler()?.(event)
				}
			>
				{config().icon}
			</IconButton>
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
