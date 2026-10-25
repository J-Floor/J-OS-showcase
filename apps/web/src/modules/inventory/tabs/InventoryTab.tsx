import { Table, type JfColumnDefinition } from "@j-os/design-system";
import { createContext, createSignal, type Accessor, type JSX } from "solid-js";

import {
	createSheetNav,
	type SheetNavState,
} from "../../../lib/createSheetNav.ts";
import { useRequiredContext } from "../../../shared/compound.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import type { EntityDescriptor } from "../../../shared/entity/entityDescriptor.ts";
import { useRowPrefetch } from "../../../shared/entity/useRowPrefetch.ts";
import type { EntityRow } from "../../../shared/types.ts";

/** What `InventoryTab.Sheet` hands its child: accessors, never values, so the
 *  sheet updates in place instead of being re-created. */
export type InventorySheetArgs<Row> = {
	open: Accessor<boolean>;
	onOpenChange: (isOpen: boolean) => void;
	row: Accessor<Row | undefined>;
	initialAssetTag: Accessor<string | undefined>;
	nav: SheetNavState;
	prebuild: Accessor<boolean>;
};

const SheetArgsContext = createContext<InventorySheetArgs<never>>();

/**
 * The tab's sheet. Its child is called once, outside any tracked scope, with
 * accessors: reading `open()` / `row()` / the prefill is deferred into the
 * sheet's own render. Reading the values here instead would put those reads
 * at this call site, which Solid re-runs on every signal change, disposing
 * and recreating the sheet instead of updating it in place.
 *
 * `Row` is asserted, not inferred: a Solid context cannot carry
 * `InventoryTab`'s type parameter.
 */
function Sheet<Row>(props: {
	children: (sheet: InventorySheetArgs<Row>) => JSX.Element;
}): JSX.Element {
	const args = useRequiredContext(
		SheetArgsContext,
		"InventoryTab.Sheet",
		"InventoryTab.Root"
	);
	// eslint-disable-next-line solid/reactivity -- intentional single call outside a tracked scope; the callback takes accessors, so no reactive read happens here
	return props.children(args);
}

function Root<Row extends Record<string, unknown> & EntityRow>(props: {
	data: () => Row[] | undefined;
	columns: () => JfColumnDefinition<Row>[];
	/** Sheet open/close/current-row/URL state — the single source of truth,
	 *  created once per tab in `InventoryPage`. */
	selection: EntitySelection<Row>;
	/** This tab's entity descriptor; its `prefetch` warms the sheet's queries on
	 *  row hover and keyboard focus. */
	descriptor?: EntityDescriptor<Row>;
	/** Asset-tag prefill for a create-mode open (items only). Read only while the
	 *  sheet is open in create mode. */
	newItemAssetTag?: () => string | undefined;
	/** Items tab only: checkboxes + header select-all. Types/categories omit this. */
	enableRowSelection?: boolean;
	/** `InventoryTab.Sheet`, and `Table.BatchActions` when row selection is on. */
	children?: JSX.Element;
}): JSX.Element {
	const [displayed, setDisplayed] = createSignal<Row[]>([]);
	// eslint-disable-next-line solid/reactivity -- the descriptor is fixed for this tab
	const prefetchRow = useRowPrefetch(props.descriptor);

	// Nav walks the DISPLAYED rows by `_id`. `selection.requestedId()` is the
	// slug (the asset tag for items), which would never match a row's `_id`, so
	// the current id is taken from the resolved row instead.
	const nav = createSheetNav({
		items: displayed,
		currentId: () => props.selection.selected()?._id,
		onSelect: (row) => {
			props.selection.openRow(row);
		},
	});

	const sheetArgs: InventorySheetArgs<Row> = {
		open: () => props.selection.open(),
		onOpenChange: (isOpen) => {
			// The sheet only ever asks to close (it has no self-open trigger);
			// closing must go through the selection so it clears requestedId and
			// the URL param — otherwise the row lingers and re-opens on refetch.
			if (!isOpen) props.selection.close();
		},
		row: () => props.selection.selected(),
		initialAssetTag: () =>
			props.selection.creating() ? props.newItemAssetTag?.() : undefined,
		nav,
		prebuild: () => props.selection.prebuild(),
	};

	return (
		<SheetArgsContext.Provider
			value={sheetArgs as unknown as InventorySheetArgs<never>}
		>
			<Table.Root
				columns={props.columns()}
				data={props.data()}
				getRowId={(row) => row._id}
				onDisplayedRowsChange={setDisplayed}
				onRowClick={(row) => {
					props.selection.openRow(row);
				}}
				focusableRows
				suppressFocus={props.selection.open()}
				onRowActivate={(row) => {
					props.selection.openRow(row);
				}}
				onRowHoverIntent={(row) => {
					prefetchRow(row);
					props.selection.intend();
				}}
				onFocusedRowChange={prefetchRow}
				enableRowSelection={props.enableRowSelection}
			>
				{props.children}
			</Table.Root>
		</SheetArgsContext.Provider>
	);
}

export const InventoryTab = { Root, Sheet };
