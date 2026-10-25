/**
 * `Table.Root`'s `<tbody>` contents: skeleton rows while loading, then the
 * flat rows, or the grouped rows — all of them, or the virtual window with a
 * pad row above and below.
 */
import { Key } from "@solid-primitives/keyed";
import type { Row as TanRow } from "@tanstack/solid-table";
import type { VirtualItem } from "@tanstack/solid-virtual";
import {
	type Accessor,
	type JSX,
	Show,
	createEffect,
	createMemo,
	on,
} from "solid-js";

import { Deferred } from "../Deferred/Deferred.tsx";

import type { RenderItem } from "./rowGroups.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";
import styles from "./Table.module.scss";
import {
	EmptyRow,
	GroupHeaderRow,
	columnCount,
	hasActions,
	renderRow,
	type RowContext,
} from "./TableRow.tsx";
import type { RowVirtualizer, ScrollParent } from "./virtualRows.ts";

/** What the body reads from the table it renders in. */
export type BodyContext<Data extends Record<string, unknown>> =
	RowContext<Data> & {
		loading: () => boolean;
		scroll: ScrollParent;
		renderItems: Accessor<RenderItem<Data>[]>;
		rows: RowVirtualizer;
	};

/** A row standing in for rows that are not rendered: no cells, just
 *  height. The height is a custom property so the size stays in SCSS. */
function PadRow(rowProps: { height: number }): JSX.Element {
	return (
		<tr
			aria-hidden="true"
			class={styles.padRow}
			style={{ "--jf-table-pad": `${String(rowProps.height)}px` }}
		/>
	);
}

/** Skeleton rows lined up with the visible columns. */
function LoadingRows<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
	rows?: number;
}): JSX.Element {
	return (
		<SkeletonRows
			columns={columnCount(body.context.table)}
			hasActions={hasActions(body.context.table)}
			rows={body.rows}
		/>
	);
}

const LOADING_MORE_ROWS = 3;

/** Skeleton rows after the last row while the next page loads. */
function LoadingMoreRows<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
}): JSX.Element {
	return (
		<Show when={body.context.props.loadingMore}>
			<LoadingRows context={body.context} rows={LOADING_MORE_ROWS} />
		</Show>
	);
}

/** What a virtual item is kept by across refreshes: its group's key or its
 *  row's id, apart so the two never collide. An index stands in while the
 *  item is missing (a window frozen over fewer items). */
function virtualItemKey<Data extends Record<string, unknown>>(
	context: BodyContext<Data>,
	index: number
): string {
	const item = context.renderItems().at(index);
	if (!item) return `index:${String(index)}`;
	return item.kind === "group"
		? `group:${item.group.key}`
		: `row:${context.rowId(item.row)}`;
}

/** One rendered virtual item: a group header or a data row, reporting its
 *  height through `measure`. The item's kind is fixed by its key; its
 *  index and its data are read live, and the last one is kept while the
 *  item is missing. */
function renderVirtualItem<Data extends Record<string, unknown>>(
	context: BodyContext<Data>,
	index: Accessor<number>,
	measure: (element: HTMLTableRowElement) => void
): JSX.Element {
	const resolved = createMemo<RenderItem<Data> | undefined>(
		(last) => context.renderItems().at(index()) ?? last
	);
	// Narrowed before the branch: `Show`'s `when` takes a value, not a
	// predicate, so testing `kind` inline would leave both arms holding the
	// union.
	function group() {
		const item = resolved();
		return item?.kind === "group" ? item.group : undefined;
	}
	function row() {
		const item = resolved();
		return item?.kind === "row" ? item.row : undefined;
	}
	return (
		<Show
			when={group()}
			fallback={
				<Show when={row()}>
					{(leaf) =>
						renderRow(context, leaf, {
							get index() {
								return index();
							},
							ref: measure,
						})
					}
				</Show>
			}
		>
			{(header) => (
				<GroupHeaderRow
					context={context}
					group={header()}
					index={index()}
					ref={measure}
				/>
			)}
		</Show>
	);
}

/**
 * The virtual window, with one pad row above and one below standing in
 * for everything not rendered. Pads are `<tr>`s rather than a positioned
 * container because the rows must stay real table rows — the shared track
 * list, the sticky actions column and the group-header span all depend on
 * it.
 */
function VirtualBody<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
}): JSX.Element {
	// Frozen while `hidden()`: with the scroll parent at 0 height there is
	// nothing to window against, so re-reading the virtualiser would
	// collapse the window to nothing.
	//
	// `virtualizer.getVirtualItems()` is NOT a plain array — the solid
	// wrapper keeps it in a Solid store and updates it via `reconcile()`
	// (keyed by row index) on every internal recompute, including the one
	// triggered by the scroll parent's own resize-to-0. `reconcile` mutates
	// that store's array in place, so simply holding onto the reference
	// returned here would still collapse to empty the moment the store
	// recomputes — caching has to take its own copy of the *array*, not the
	// live store, to actually freeze. The per-item objects inside stay the
	// live store's own proxies (reconcile keeps their identity stable by
	// index), which is what lets `<For>` leave the already-mounted `<tr>`s
	// alone.
	//
	// Also freeze on RE-SHOW, not just while hidden: virtual-core's
	// `calculateRange` returns `[]` whenever the viewport's `outerSize` is
	// 0, so the store sits empty for the whole time the table is hidden.
	// On return, Table's own `ResizeObserver` fires and flips `hidden()`
	// false BEFORE the virtualiser has recomputed against the new size —
	// so the first read after a resize can still see the stale empty
	// store. Reading straight off `hidden()` alone would unmount every
	// row for that one frame (padTop/padBottom collapse to 0, forcing a
	// layout via the `scrollMargin` getter's `getBoundingClientRect`),
	// which is the exact freeze this code exists to prevent — just
	// retriggered on the way back in. Guarding on "the live store just
	// went empty while we know there ARE rows to render" catches that
	// frame regardless of which observer fires first, so this no longer
	// depends on Table's resize observer registering before the
	// virtualiser's.
	let lastItems: VirtualItem[] = [];
	const items = createMemo(() => {
		const live = body.context.rows.virtualizer.getVirtualItems();
		if (
			body.context.scroll.hidden() ||
			(live.length === 0 && body.context.renderItems().length > 0)
		) {
			return lastItems;
		}
		lastItems = [...live];
		return lastItems;
	});
	function padTop(): number {
		return items()[0]
			? items()[0].start -
					body.context.rows.virtualizer.options.scrollMargin
			: 0;
	}
	/**
	 * Height to reserve for the rows below the window. Read straight from
	 * `getTotalSize()` (measured rows + estimates for the rest), minus
	 * where the last rendered row ends — the exact amount of scroll left
	 * beneath the fold.
	 *
	 * `getTotalSize()` on `@tanstack/solid-virtual` is a Solid signal (see
	 * the wrapper's Proxy `handler.get` for `"getTotalSize"`) — reading it
	 * subscribes, so this recomputes as measurements land and the total
	 * grows. Trusting it keeps the scrollbar honest: a grouped table used
	 * to cut off at row fifteen because the bottom pad was estimated from a
	 * row count that shrank whenever a group collapsed but didn't account
	 * for the measured rows above.
	 */
	function padBottom(): number {
		const last = items().at(-1);
		return last
			? Math.max(
					0,
					body.context.rows.virtualizer.getTotalSize() - last.end
				)
			: 0;
	}
	return (
		<>
			<Show when={padTop() > 0}>
				<PadRow height={padTop()} />
			</Show>
			{/* Kept by group key or row id, like the plain body: a refresh,
			    a sort or a collapse moves a row's `<tr>` rather than
			    rebuilding it, so a box a morph names inside it survives. */}
			<Key
				each={items()}
				by={(virtualRow) =>
					virtualItemKey(body.context, virtualRow.index)
				}
			>
				{(virtualRow) => {
					function index(): number {
						return virtualRow().index;
					}
					// Every rendered row reports its real height back, so a
					// wrapped cell does not throw off the spacers.
					//
					// Two ordering problems, one fix. Solid runs a `ref`
					// callback when the element is created, BEFORE its
					// attributes are applied, so the virtualiser read
					// `data-index` back as null and warned on every row —
					// hence stamping it here. And measuring writes to the
					// virtualiser, which re-runs this very list: doing that
					// synchronously inside the render re-entered the list
					// mid-update and blew up on a row that no longer
					// existed. The microtask lets the render finish first.
					let measured: HTMLTableRowElement | undefined;
					function report(element: HTMLTableRowElement): void {
						queueMicrotask(() => {
							if (element.isConnected)
								body.context.rows.virtualizer.measureElement(
									element
								);
						});
					}
					function measure(element: HTMLTableRowElement): void {
						measured = element;
						element.dataset.index = String(index());
						report(element);
					}
					// A kept row that moves (a sort, a collapse above it)
					// reports its height again at its new index: the
					// virtualiser caches heights by index, and its resize
					// observer only fires on a size change.
					createEffect(
						on(
							index,
							() => {
								if (measured) report(measured);
							},
							{ defer: true }
						)
					);
					return renderVirtualItem(body.context, index, measure);
				}}
			</Key>
			<Show when={padBottom() > 0}>
				<PadRow height={padBottom()} />
			</Show>
			<LoadingMoreRows context={body.context} />
		</>
	);
}

/** Rows rendered by id: each `<tr>` is kept across data refreshes and reads
 *  its fresh `Row` through the accessor. */
function KeyedRows<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
	rows: Accessor<readonly TanRow<Data>[]>;
}): JSX.Element {
	return (
		<Key each={body.rows()} by={(row) => body.context.rowId(row)}>
			{(row) => renderRow(body.context, row)}
		</Key>
	);
}

function FlatBody<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
}): JSX.Element {
	return (
		<Show
			when={body.context.table.getRowModel().rows.length > 0}
			fallback={<EmptyRow context={body.context} />}
		>
			<>
				<KeyedRows
					context={body.context}
					rows={() => body.context.table.getRowModel().rows}
				/>
				<LoadingMoreRows context={body.context} />
			</>
		</Show>
	);
}

function GroupedBody<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
}): JSX.Element {
	return (
		<Show
			when={body.context.groups.rowGroups().length > 0}
			fallback={<EmptyRow context={body.context} />}
		>
			{/* A virtualising table renders nothing until it has found its
			    scroll container, which cannot happen before this element is
			    in the document. `onMount` runs before the browser paints, so
			    that first empty pass is skipped rather than shown — without
			    this guard the table would render every row once and then
			    immediately throw all but a screenful away, which is the
			    exact cost being avoided. */}
			<Show
				when={
					!body.context.props.virtualize ||
					body.context.scroll.mounted()
				}
			>
				{/* A scroll parent that has NEVER been measured with a
				    height has nothing to window against — show skeleton rows
				    rather than render every row, which is what made a hidden
				    tab expensive. Once it has been visible, `virtualizing()`
				    stays true and `VirtualBody` freezes its window instead. */}
				<Show
					when={
						!(
							body.context.props.virtualize &&
							body.context.scroll.scrollElement() !== null &&
							!body.context.scroll.hasEverBeenVisible()
						)
					}
					fallback={<LoadingRows context={body.context} />}
				>
					<Show
						when={body.context.rows.virtualizing()}
						fallback={
							<>
								<Key
									each={body.context.groups.rowGroups()}
									by={(group) => group.key}
								>
									{(group) => {
										return (
											<>
												<GroupHeaderRow
													context={body.context}
													group={group()}
												/>
												<Show
													when={body.context.groups.isGroupExpanded(
														group().key
													)}
												>
													<KeyedRows
														context={body.context}
														rows={() =>
															group().rows
														}
													/>
												</Show>
											</>
										);
									}}
								</Key>
								<LoadingMoreRows context={body.context} />
							</>
						}
					>
						<VirtualBody context={body.context} />
					</Show>
				</Show>
			</Show>
		</Show>
	);
}

export function TableBody<Data extends Record<string, unknown>>(body: {
	context: BodyContext<Data>;
}): JSX.Element {
	return (
		<Deferred
			hold={body.context.loading()}
			fallback={<LoadingRows context={body.context} />}
		>
			<Show
				when={body.context.props.groupBy}
				fallback={<FlatBody context={body.context} />}
			>
				<GroupedBody context={body.context} />
			</Show>
		</Deferred>
	);
}
