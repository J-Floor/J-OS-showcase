import type {
	RowSelectionState,
	Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import { type Accessor, type JSX, Show, createContext } from "solid-js";

import { useRequiredContext } from "../../utils/context.ts";
import { Button } from "../Button/Button.tsx";

import styles from "./Table.module.scss";

/** The checked rows of the enclosing `Table.Root`. */
export type TableSelection<Data extends Record<string, unknown>> = {
	/** The checked rows' original data objects, in row-model order. */
	rows: Accessor<Data[]>;
	count: Accessor<number>;
	/** Uncheck every row. */
	clear: () => void;
};

const SelectionContext =
	createContext<TableSelection<Record<string, unknown>>>();

/**
 * The enclosing `Table.Root`'s checked rows, for anything rendered among its
 * children (typically inside `Table.BatchActions`).
 *
 * `Data` is asserted, not inferred: a Solid context cannot carry
 * `Table.Root`'s type parameter.
 */
export function useSelection<
	Data extends Record<string, unknown>,
>(): TableSelection<Data> {
	return useRequiredContext(
		SelectionContext,
		"Table.useSelection",
		"Table.Root"
	) as TableSelection<Data>;
}

export type BatchActionsProps = {
	/** The bar's actions. They read the selection with `Table.useSelection`. */
	children?: JSX.Element;
	/** Clear the selection after a batch action's button is clicked. @default false */
	unselectOnActionCompleted?: boolean;
	class?: string;
};

/**
 * Selection action bar, a child of `Table.Root`, visible only while at least
 * one row is checked. It shows the count and a clear button before its own
 * children.
 *
 * Ported from EmboUI's `BatchActions`. React→Solid: the React context
 * (`useTableContext`) becomes a Solid context provided by `Table.Root`, which
 * carries a reactive `rowSelection` accessor created in `Table.Root`'s own
 * scope, so the bar tracks selection changes across component boundaries.
 */
export function BatchActions(props: BatchActionsProps): JSX.Element {
	const selection = useSelection();

	function handleClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const button = target.closest("button");
		if (button && props.unselectOnActionCompleted) {
			setTimeout(selection.clear, 0);
		}
	}

	// Always mounted so the `.visible` class can drive a scale-in/out transition
	// (a `<Show>` on the bar would mount it already-visible, skipping the anim).
	// The contents stay gated by selection so the action buttons aren't in the
	// DOM when nothing is selected.
	return (
		<div
			class={clsx(
				styles.batchActions,
				selection.count() > 0 && styles.visible,
				props.class
			)}
			onClick={handleClick}
		>
			<Show when={selection.count() > 0}>
				<span class={styles.selectedCount}>
					{selection.count()} selected
				</span>
				<Button variant="tertiary" onClick={selection.clear}>
					Clear selection
				</Button>
				{props.children}
			</Show>
		</div>
	);
}

/**
 * Provides the selection to `Table.Root`'s children, so `Table.BatchActions`
 * and `Table.useSelection` find it.
 *
 * `rowSelection` is the reactive selection signal, created in `Table.Root`'s
 * scope: the table's memoised row models alone do not track across the
 * component boundary, so `rows` reads it first.
 */
export function SelectionProvider<Data extends Record<string, unknown>>(props: {
	table: TanTable<Data>;
	rowSelection: Accessor<RowSelectionState>;
	children: JSX.Element;
}): JSX.Element {
	const selection: TableSelection<Data> = {
		rows: () => {
			props.rowSelection();
			return props.table
				.getSelectedRowModel()
				.rows.map((row) => row.original);
		},
		count: () => Object.values(props.rowSelection()).filter(Boolean).length,
		clear: () => {
			props.table.resetRowSelection();
		},
	};
	return (
		<SelectionContext.Provider value={selection}>
			{props.children}
		</SelectionContext.Provider>
	);
}
