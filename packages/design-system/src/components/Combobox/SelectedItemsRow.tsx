import clsx from "clsx";
import {
	createEffect,
	createSignal,
	For,
	on,
	onCleanup,
	Show,
	type JSX,
} from "solid-js";

import { ICONS } from "../../icons.ts";
import { fitSelectedItems } from "../../utils/fitSelectedItems.ts";
import { Chip } from "../Chip/Chip.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";

import styles from "./Combobox.module.scss";

export type SelectedItemsRowProps<T> = {
	/** The selected items, earliest first. */
	items: T[];

	/** The value identifying an item, used as its key and to remove it. */
	getValue: (item: T) => string;

	/** The text the default chip shows for an item. */
	getLabel: (item: T) => string;

	/** Drops a single value from the selection. */
	onRemove: (value: string) => void;

	/** Replaces the default chip for each selected item. */
	renderItem?: (item: T) => JSX.Element;

	class?: string;
};

/**
 * The current selection, rendered on the control's single line.
 *
 * The row never wraps and never scrolls. As many of the most recent items as
 * fit are rendered; the earlier ones collapse into a leading `+X` badge.
 * Widths come from a hidden copy of the full row, so an item that is currently
 * collapsed still has a width to fit once the control grows.
 *
 * Internal to the selection components (Combobox); not exported from the
 * package's `index.ts`.
 *
 * Solid port of EmboUI's `SelectedItemsRow`: `useRef` -> `let el: … | undefined`
 * with `ref={el}`, `useState` -> `createSignal`, the two `useLayoutEffect`s ->
 * `createEffect(on(...))` (value-key re-measure; hasItems-gated ResizeObserver),
 * `React.Fragment`/`.map` -> `<For>`. jsdom never lays anything out, so
 * `container.clientWidth` reads 0 there; `measure()` treats that as "cannot
 * measure" and leaves every item visible instead of collapsing to one.
 */
export function SelectedItemsRow<T>(
	props: SelectedItemsRowProps<T>
): JSX.Element {
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={containerEl}` binding below, which the rule can't see
	let containerEl: HTMLDivElement | undefined;
	// eslint-disable-next-line no-unassigned-vars -- assigned by Solid's `ref={measureEl}` binding below, which the rule can't see
	let measureEl: HTMLDivElement | undefined;

	// Everything is visible until the first measurement, so the row does not
	// flash a `+X` badge on mount. Read once as the signal's initial value,
	// not a tracked dependency (later changes flow through `measure()`).
	// eslint-disable-next-line solid/reactivity -- initial value only, read once at setup
	const [visibleCount, setVisibleCount] = createSignal(props.items.length);

	function measure(): void {
		const container = containerEl;
		const measured = measureEl;
		if (!container || !measured) return;

		// jsdom performs no layout, so `clientWidth`/`getBoundingClientRect`
		// all read 0 there. Treat that as "cannot measure" and leave every
		// item visible rather than collapsing the row to a single chip.
		if (container.clientWidth === 0) {
			setVisibleCount(props.items.length);
			return;
		}

		// The row's gap is folded into every width, and the container is
		// grown by one gap so the trailing gap the last item does not have
		// cancels.
		const gap =
			Number.parseFloat(getComputedStyle(container).columnGap) || 0;
		// The badge leads the hidden row, so the chips are everything after it.
		const [badge, ...chips] = Array.from(measured.children);

		const chipWidths = chips.map(
			(chip) => chip.getBoundingClientRect().width + gap
		);
		const badgeWidth = badge.getBoundingClientRect().width + gap;

		setVisibleCount(
			fitSelectedItems(
				chipWidths,
				container.clientWidth + gap,
				badgeWidth
			).visibleCount
		);
	}

	// Re-measured on every value change as well as on resize: an added or
	// removed item changes the widths without changing the container's.
	createEffect(
		on(
			() => props.items.map(props.getValue).join(","),
			() => {
				queueMicrotask(measure);
			}
		)
	);

	// `hasItems` is the dependency because the row renders nothing until
	// something is selected. Without it this would run once against no
	// container to observe, and never run again, so the row would only ever
	// recompute on a value change and never on a resize.
	createEffect(
		on(
			() => props.items.length > 0,
			(hasItems) => {
				if (!hasItems || typeof ResizeObserver === "undefined") return;
				const container = containerEl;
				if (!container) return;

				const observer = new ResizeObserver(measure);
				observer.observe(container);
				onCleanup(() => {
					observer.disconnect();
				});
			}
		)
	);

	function shown(): number {
		return Math.min(visibleCount(), props.items.length);
	}

	function hiddenCount(): number {
		return props.items.length - shown();
	}

	function visibleItems(): T[] {
		return props.items.slice(props.items.length - shown());
	}

	// Not a component: the row's own markup for one selection, rendered
	// twice (hidden and visible).
	function renderItem(item: T): JSX.Element {
		if (props.renderItem) return props.renderItem(item);

		const value = props.getValue(item);
		return (
			<Chip class={styles.selectedChip}>
				<span class={styles.selectedChipLabel}>
					{props.getLabel(item)}
				</span>
				<IconButton
					tooltipLabel={`Remove ${props.getLabel(item)}`}
					// Stop the click reaching the control (whose input opens the
					// list) and remove just this selection.
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						props.onRemove(value);
					}}
				>
					{ICONS.close}
				</IconButton>
			</Chip>
		);
	}

	return (
		<Show when={props.items.length > 0}>
			<div
				ref={containerEl}
				class={clsx(styles.selectedItems, props.class)}
			>
				{/* Hidden copy of the full row: it is what the widths are read
				    from, so a collapsed item can come back when the control
				    grows. `visibility: hidden` (from `.selectedMeasure`) also
				    keeps it out of the a11y tree and out of the tab order. */}
				<div
					ref={measureEl}
					aria-hidden="true"
					class={styles.selectedMeasure}
				>
					<span class={styles.selectedOverflow}>
						+{props.items.length - 1}
					</span>
					<For each={props.items}>
						{(item) => <div>{renderItem(item)}</div>}
					</For>
				</div>
				<Show when={hiddenCount() > 0}>
					<span class={styles.selectedOverflow}>
						+{hiddenCount()}
					</span>
				</Show>
				<For each={visibleItems()}>{(item) => renderItem(item)}</For>
			</div>
		</Show>
	);
}
