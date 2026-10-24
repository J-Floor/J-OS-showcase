import {
	Table,
	type JfColumnDefinition,
	type TableSelection,
} from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import { createSheetNav } from "../../../lib/createSheetNav.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";
import type { EntityDescriptor } from "../../../shared/entity/entityDescriptor.ts";
import type { SheetNavState } from "../../../shared/entity/EntitySheetHeader.tsx";
import { useRowPrefetch } from "../../../shared/entity/useRowPrefetch.ts";

/** The selection bar's contents: hands the table's selection to the tab's
 *  `batchActions`. */
function InventoryBatchBar<Row extends Record<string, unknown>>(props: {
	batchActions?: (selection: TableSelection<Row>) => JSX.Element;
}): JSX.Element {
	const selection = Table.useSelection<Row>();
	// eslint-disable-next-line solid/reactivity -- called once; the selection hands out accessors, read inside the bar's own JSX
	return props.batchActions?.(selection) ?? null;
}

export function InventoryTab<
	Row extends Record<string, unknown> & { _id: string },
>(props: {
	data: () => Row[] | undefined;
	columns: () => JfColumnDefinition<Row>[];
	/** Sheet open/close/current-row/URL state — the single source of truth,
	 *  created once per tab in `InventoryPage`. Replaces the old internal
	 *  open/editingId signals and the `requestNew`/`requestOpenItem` nonces. */
	selection: EntitySelection<Row>;
	/** This tab's entity descriptor; its `prefetch` warms the sheet's queries on
	 *  row hover and keyboard focus. */
	descriptor?: EntityDescriptor<Row>;
	/** Asset-tag prefill for a create-mode open (items only). Read only while the
	 *  sheet is open in create mode. */
	newItemAssetTag?: () => string | undefined;
	/** Items tab only: checkboxes + header select-all. Types/categories omit this. */
	enableRowSelection?: boolean;
	/** Selection-bar contents. Only rendered when row selection is on. */
	batchActions?: (selection: TableSelection<Row>) => JSX.Element;
	renderSheet: (args: {
		open: () => boolean;
		onOpenChange: (isOpen: boolean) => void;
		row: () => Row | undefined;
		initialAssetTag: () => string | undefined;
		nav: SheetNavState;
	}) => JSX.Element;
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

	// Called once, outside any tracked scope: the callback receives accessors
	// (not values), so reading `open()` / `selected()` / the prefill is deferred
	// into the child's own render. Reading the values here instead would put
	// those reads in this render-prop call site, which Solid re-runs on every
	// signal change — disposing and recreating the sheet instead of updating it
	// in place.
	// eslint-disable-next-line solid/reactivity -- intentional single call outside a tracked scope; the callback takes accessors, so no reactive read happens here
	const sheet = props.renderSheet({
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
		nav: {
			hasPrev: nav.hasPrev,
			hasNext: nav.hasNext,
			onPrev: nav.prev,
			onNext: nav.next,
		},
	});

	return (
		<>
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
				onRowHoverIntent={prefetchRow}
				onFocusedRowChange={prefetchRow}
				enableRowSelection={props.enableRowSelection}
			>
				<Show when={props.enableRowSelection}>
					<Table.BatchActions>
						<InventoryBatchBar batchActions={props.batchActions} />
					</Table.BatchActions>
				</Show>
			</Table.Root>
			{sheet}
		</>
	);
}
