import type {
	RowSelectionState,
	Table as TanTable,
} from "@tanstack/solid-table";
import clsx from "clsx";
import {
	type Accessor,
	type JSX,
	Show,
	createContext,
	useContext,
} from "solid-js";

import { Button } from "../Button/Button.tsx";

import styles from "./Table.module.scss";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- table type is per-render
type AnyTable = TanTable<any>;

type BatchActionsContextValue = {
	table: AnyTable;
	/** Reactive row-selection signal, created in `Table.Root`'s scope. */
	rowSelection: Accessor<RowSelectionState>;
};

const BatchActionsContext = createContext<BatchActionsContextValue>();

export type BatchActionsRenderProps<Data extends Record<string, unknown>> = {
	selectedRows: Data[];
	selectedCount: number;
	clearSelection: () => void;
	table: TanTable<Data>;
};

export type BatchActionsProps<Data extends Record<string, unknown>> = {
	children?:
		| JSX.Element
		| ((props: BatchActionsRenderProps<Data>) => JSX.Element);
	/** Clear the selection after a batch action's button is clicked. @default false */
	unselectOnActionCompleted?: boolean;
	class?: string;
};

/**
 * Selection action bar, a render-prop child of `Table.Root`. Receives
 * `{ selectedRows, selectedCount, clearSelection, table }`; visible only when
 * at least one row is selected.
 *
 * Ported from EmboUI's `BatchActions`. React→Solid: the React context
 * (`useTableContext`) becomes a Solid context provided by `Table.Root`. The
 * context carries a reactive `rowSelection` accessor (created in `Table.Root`'s
 * own scope) so the bar's visibility tracks selection changes across component
 * boundaries — reading the memoized table row models alone is not reactive here.
 * The children render-prop is supported via a function child.
 */
function BatchActionsComponent<Data extends Record<string, unknown>>(
	props: BatchActionsProps<Data>
): JSX.Element {
	const ctx = useContext(BatchActionsContext);
	// eslint-disable-next-line solid/components-return-once -- context is always provided by Table.Root at mount; the guard only handles misuse
	if (!ctx) return null;
	const t = ctx.table as TanTable<Data>;
	const rowSelection = ctx.rowSelection;

	function selectedCount(): number {
		return Object.values(rowSelection()).filter(Boolean).length;
	}
	function selectedRows(): Data[] {
		return t.getSelectedRowModel().rows.map((r) => r.original);
	}

	function clearSelection() {
		t.resetRowSelection();
	}

	function content(): JSX.Element {
		const children = props.children;
		if (typeof children === "function") {
			// Expose reactive getters (not snapshots) so a render-prop body that
			// reads `p.selectedCount`/`p.selectedRows` updates as the selection
			// changes (e.g. 1 → 2 rows).
			return children({
				get selectedRows() {
					return selectedRows();
				},
				get selectedCount() {
					return selectedCount();
				},
				clearSelection,
				table: t,
			});
		}
		return children;
	}

	function handleClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const button = target.closest("button");
		if (button && props.unselectOnActionCompleted) {
			setTimeout(clearSelection, 0);
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
				selectedCount() > 0 && styles.visible,
				props.class
			)}
			onClick={handleClick}
		>
			<Show when={selectedCount() > 0}>
				<span class={styles.selectedCount}>
					{selectedCount()} selected
				</span>
				<Button variant="tertiary" onClick={clearSelection}>
					Clear selection
				</Button>
				{content()}
			</Show>
		</div>
	);
}

/**
 * Provides the table instance + reactive selection accessor to any
 * `Table.BatchActions` descendants. Rendered by `Table.Root` around the
 * consumer's children (placed below the table).
 */
function Provider(props: {
	table: AnyTable;
	rowSelection: Accessor<RowSelectionState>;
	children: JSX.Element;
}): JSX.Element {
	return (
		<BatchActionsContext.Provider
			value={{
				get table() {
					return props.table;
				},
				// eslint-disable-next-line solid/reactivity -- forwarding the accessor function itself, not unwrapping it
				rowSelection: props.rowSelection,
			}}
		>
			{props.children}
		</BatchActionsContext.Provider>
	);
}

export const BatchActions = {
	Component: BatchActionsComponent,
	Provider,
};
