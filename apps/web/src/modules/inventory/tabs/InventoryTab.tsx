import {
	Table,
	type BatchActionsRenderProps,
	type JfColumnDef,
} from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import { createDrawerNav } from "../../../lib/createDrawerNav.ts";
import type { EntitySelection } from "../../../shared/entity/createEntitySelection.ts";

export function InventoryTab<
	Row extends Record<string, unknown> & { _id: string },
>(props: {
	data: () => Row[] | undefined;
	columns: () => JfColumnDef<Row>[];
	/** Drawer open/close/current-row/URL state — the single source of truth,
	 *  created once per tab in `InventoryPage`. Replaces the old internal
	 *  open/editingId signals and the `requestNew`/`requestOpenItem` nonces. */
	selection: EntitySelection<Row>;
	/** Asset-tag prefill for a create-mode open (items only). Read only while the
	 *  drawer is open in create mode. */
	newItemAssetTag?: () => string | undefined;
	/** Items tab only: checkboxes + header select-all. Types/categories omit this. */
	enableRowSelection?: boolean;
	/** Selection-bar contents. Only rendered when row selection is on. */
	batchActions?: (props: BatchActionsRenderProps<Row>) => JSX.Element;
	renderDrawer: (args: {
		open: () => boolean;
		onOpenChange: (open: boolean) => void;
		row: () => Row | undefined;
		initialAssetTag: () => string | undefined;
		nav: {
			hasPrev: () => boolean;
			hasNext: () => boolean;
			onPrev: () => void;
			onNext: () => void;
		};
	}) => JSX.Element;
}): JSX.Element {
	const [displayed, setDisplayed] = createSignal<Row[]>([]);

	// Nav walks the DISPLAYED rows by `_id`. `selection.selectedId()` is the
	// slug (the asset tag for items), which would never match a row's `_id`, so
	// the current id is taken from the resolved row instead.
	const nav = createDrawerNav({
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
	// signal change — disposing and recreating the drawer instead of updating it
	// in place.
	// eslint-disable-next-line solid/reactivity -- intentional single call outside a tracked scope; the callback takes accessors, so no reactive read happens here
	const drawer = props.renderDrawer({
		open: () => props.selection.open(),
		onOpenChange: (v) => {
			// The drawer only ever asks to close (it has no self-open trigger);
			// closing must go through the selection so it clears selectedId and
			// the URL param — otherwise the row lingers and re-opens on refetch.
			if (!v) props.selection.close();
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
				onDisplayedRowsChange={setDisplayed}
				onRowClick={(row) => {
					props.selection.openRow(row);
				}}
				focusableRows
				suppressFocus={props.selection.open()}
				onRowActivate={(row) => {
					props.selection.openRow(row);
				}}
				enableRowSelection={props.enableRowSelection}
			>
				<Show when={props.enableRowSelection}>
					<Table.BatchActions<Row>>
						{(p) => props.batchActions?.(p) ?? null}
					</Table.BatchActions>
				</Show>
			</Table.Root>
			{drawer}
		</>
	);
}
