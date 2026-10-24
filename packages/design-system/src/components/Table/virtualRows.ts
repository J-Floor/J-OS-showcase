/**
 * `Table.Root`'s row windowing: the element the rows scroll in and whether it
 * has a height, the virtualiser over the render items, and `onEndReached`.
 */
import { createVirtualizer, type Virtualizer } from "@tanstack/solid-virtual";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	untrack,
} from "solid-js";

import type { RenderItem } from "./rowGroups.ts";
import type { TableRootProps } from "./Table.tsx";

/** Roughly one line of text plus padding. Stands in for a row the virtualiser
 * has not measured yet, and for one it could only measure at zero height (see
 * `measureElement`). Mirrors `$row-height` in Table.module.scss, which sizes
 * the skeleton rows — change both together. */
const ESTIMATED_ROW_HEIGHT = 53;

const END_REACHED_THRESHOLD_ROWS = 10;

export type ScrollParent = {
	/** The `ref` of the table's own scroll box, where the walk up starts. */
	ref: (element: HTMLDivElement) => void;
	/** The element that scrolls the rows, once mounted; `null` when none. */
	scrollElement: Accessor<HTMLElement | null>;
	/** Whether the scroll parent has been looked for (the table is mounted). */
	mounted: Accessor<boolean>;
	/** The scroll parent's current inner height. */
	scrollParentHeight: Accessor<number>;
	/** Whether the scroll parent has EVER had a height. */
	hasEverBeenVisible: Accessor<boolean>;
	/** Whether the scroll parent is there but 0 high (a hidden tab panel). */
	hidden: () => boolean;
};

export type RowVirtualizer = {
	/** Whether the rows are actually windowed. */
	virtualizing: () => boolean;
	virtualizer: Virtualizer<HTMLElement, Element>;
};

/**
 * The element that actually scrolls this table vertically. The design system
 * does not know the app's layout — it may be a shell region several levels
 * up, or the table's own scroll box — so find it rather than assume it.
 *
 * Starts AT `scrollReference`, not above it. That element carries the horizontal
 * overflow, which makes it a scroll container in both axes; once a caller
 * bounds its height it is the box the rows scroll in and the sticky header
 * sticks to. Skipping it sent the virtualiser to measure the page region
 * instead, so it windowed against a viewport the rows were no longer moving
 * through.
 */
function findScrollParent(start: HTMLElement | undefined): HTMLElement | null {
	let node: HTMLElement | null = start ?? null;
	while (node) {
		const overflow = getComputedStyle(node).overflowY;
		if (overflow === "auto" || overflow === "scroll") return node;
		node = node.parentElement;
	}
	return null;
}

export function createScrollParent(): ScrollParent {
	let scrollReference: HTMLDivElement | undefined;
	function captureScrollReference(element: HTMLDivElement): void {
		scrollReference = element;
	}

	// Resolved once the wrapper is in the document; until then there is nothing
	// to walk up from. `onMount` runs before the browser paints, so the rows
	// below are never rendered twice on screen — the first pass is skipped, not
	// shown and replaced.
	const [scrollElement, setScrollElement] = createSignal<HTMLElement | null>(
		null
	);
	const [mounted, setMounted] = createSignal(false);

	/**
	 * The scroll parent's current inner height, tracked reactively so
	 * `virtualizing()` can react to it. Kept as a signal (not read via
	 * `el.clientHeight` at call time) because clientHeight is a plain DOM
	 * property — a Solid tracked scope reading it never subscribes, so the
	 * decision to virtualise would freeze at whatever value it saw on mount.
	 *
	 * That matters most for a table living inside an Ark tab panel: the panel
	 * is kept mounted between visits and hidden with `[hidden]` — clientHeight
	 * flips 0 ↔ real without any signal changing. Without a live subscription
	 * here, a table mounted while hidden stays in the un-virtualised fallback
	 * forever, and a table mounted while visible has no way to re-measure
	 * after a hide/show cycle (the blank-after-tab-switch state a previous
	 * `needsRemeasure` heuristic tried to patch after the fact). The column
	 * layout re-measures its headers off the same signal.
	 */
	const [scrollParentHeight, setScrollParentHeight] = createSignal(0);

	/** Whether the scroll parent has EVER had a height. Until then a hidden
	 *  table has nothing to window against, so it shows skeleton rows rather
	 *  than rendering everything. After that, a height of 0 means "hidden tab",
	 *  and the rendered window is frozen as-is (see `VirtualBody`). */
	const hasEverBeenVisible = createMemo<boolean>(
		(prev) => prev || scrollParentHeight() > 0,
		false
	);
	function hidden(): boolean {
		return scrollElement() !== null && scrollParentHeight() === 0;
	}

	onMount(() => {
		const element = findScrollParent(scrollReference);
		setScrollElement(element);
		setMounted(true);
		if (!element) return;
		// Seed the initial height before wiring the observer, so a browser
		// without `ResizeObserver` still virtualises a laid-out table (it just
		// won't react to later resizes) instead of falling back to render-all.
		setScrollParentHeight(element.clientHeight);
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => {
			setScrollParentHeight(element.clientHeight);
		});
		observer.observe(element);
		onCleanup(() => {
			observer.disconnect();
		});
	});

	return {
		ref: captureScrollReference,
		scrollElement,
		mounted,
		scrollParentHeight,
		hasEverBeenVisible,
		hidden,
	};
}

/**
 * Fires `onEndReached` when the rendered window comes within
 * `END_REACHED_THRESHOLD_ROWS` rows of the last row, once per row count.
 */
function watchEndReached<Data extends Record<string, unknown>>(options: {
	props: Pick<TableRootProps<Data>, "onEndReached" | "loadingMore">;
	rows: RowVirtualizer;
	renderItems: Accessor<RenderItem<Data>[]>;
	hidden: () => boolean;
	loading: () => boolean;
}): void {
	const { props, rows, renderItems, hidden, loading } = options;
	// The row count `onEndReached` last fired for; cleared when the window
	// leaves the end zone, so scrolling back in fires again.
	let endReachedCount: number | undefined;
	createEffect(() => {
		if (!props.onEndReached) return;
		// Cleared while a page loads: one that lands with no rows leaves the
		// count as it was, and the end zone must still ask for the next one.
		if (props.loadingMore) {
			endReachedCount = undefined;
			return;
		}
		if (!rows.virtualizing() || hidden() || loading()) return;
		const count = renderItems().length;
		const last = rows.virtualizer.getVirtualItems().at(-1);
		if (count === 0 || !last) return;
		if (last.index < count - 1 - END_REACHED_THRESHOLD_ROWS) {
			endReachedCount = undefined;
			return;
		}
		if (endReachedCount === count) return;
		endReachedCount = count;
		untrack(() => props.onEndReached?.());
	});
}

export function createRowVirtualizer<
	Data extends Record<string, unknown>,
>(options: {
	props: Pick<
		TableRootProps<Data>,
		"virtualize" | "onEndReached" | "loadingMore"
	>;
	scroll: ScrollParent;
	renderItems: Accessor<RenderItem<Data>[]>;
	/** The `<tbody>`, whose top is where the rows start. */
	body: () => HTMLTableSectionElement | undefined;
	loading: () => boolean;
}): RowVirtualizer {
	const { props, scroll, renderItems, body, loading } = options;

	/**
	 * Whether to actually window the rows. Requires a scroll container to
	 * measure against — with no scrollable ancestor there is no viewport to
	 * compute a window from and every row would be culled, so rendering
	 * everything is the fallback for a table that is merely laid out
	 * unusually (jsdom, or an ancestor without `overflow: auto|scroll`).
	 *
	 * A scroll parent that has been visible before keeps virtualizing even
	 * once its height drops to 0 (a hidden tab panel). There is nothing to
	 * re-window against at that point, so `VirtualBody` freezes its rendered
	 * window exactly as it was rather than recomputing against a zero-size
	 * viewport — see `hasEverBeenVisible`/`hidden()` and the `items` memo in
	 * `VirtualBody`. Only a scroll parent that has NEVER been measured with a
	 * height falls back further, to skeleton rows (see the grouped body's
	 * `hasEverBeenVisible` guard) rather than render-all.
	 */
	function virtualizing(): boolean {
		return props.virtualize
			? scroll.scrollElement() !== null && scroll.hasEverBeenVisible()
			: false;
	}

	const virtualizer = createVirtualizer({
		get count() {
			return virtualizing() ? renderItems().length : 0;
		},
		// `null` when opted out: the virtualiser then installs no scroll or
		// resize observer at all, so a table that does not want this pays
		// nothing for the code being here.
		getScrollElement: () =>
			virtualizing() ? scroll.scrollElement() : null,
		// Roughly one line of text plus padding. Wrong rows are re-measured on
		// mount via `measureElement`, so this only affects the first paint's
		// scrollbar length.
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		// Enough that a fast flick does not show blank rows, few enough that the
		// mounted-widget count stays a fraction of the table.
		overscan: 12,
		/**
		 * NEVER cache a zero.
		 *
		 * A row measured while nothing on screen has been laid out reports a
		 * height of 0 — which happens whenever this table is inside a container
		 * that mounts before it is shown. Ark's `Tabs` with `lazyMount` does
		 * exactly that: the panel is mounted, its rows render and measure, and
		 * only then is it revealed.
		 *
		 * A cached 0 is a trap the virtualiser cannot climb out of. A row of
		 * height 0 adds nothing to the total size, so the window never extends
		 * far enough to reach it, so it is never re-rendered, so it is never
		 * re-measured. A grouped table once settled with its last four items
		 * pinned at 0: `count` was 19 but `getTotalSize()` was 784 — exactly the
		 * sum of the fifteen rows that HAD been measured — so the table ended at
		 * row fifteen with no spacer beneath it and nothing left to scroll to.
		 * Its last two groups simply were not on the page.
		 *
		 * Falling back to the estimate keeps the row in the total, so the window
		 * still reaches it, and the next measurement — taken once it is visible
		 * — replaces the estimate with the truth.
		 */
		measureElement: (element) => {
			const height = element.getBoundingClientRect().height;
			return height > 0 ? height : ESTIMATED_ROW_HEIGHT;
		},
		get scrollMargin() {
			// Distance from the top of the scroll container's content to the top
			// of the rows — the header and anything above the table. Without it
			// every row sits one header too high.
			const bodyReference = body();
			if (!bodyReference) return 0;
			const parent = scroll.scrollElement();
			return parent
				? bodyReference.getBoundingClientRect().top -
						parent.getBoundingClientRect().top +
						parent.scrollTop
				: 0;
		},
	});

	const rows = { virtualizing, virtualizer };
	watchEndReached({
		props,
		rows,
		renderItems,
		hidden: scroll.hidden,
		loading,
	});
	return rows;
}
