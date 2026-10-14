import type { Column } from "@tanstack/solid-table";
import clsx from "clsx";
import { type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";
import iconButtonStyles from "../IconButton/IconButton.module.scss";
import { Popover } from "../Popover/Popover.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import { createColumnFilter } from "./columnFilterState.ts";
import { FilterBody } from "./FilterBodies.tsx";
import styles from "./Table.module.scss";

const FOCUSABLE =
	'input, button, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/**
 * The first focusable element in a filter popover that is not part of a mode
 * toggle (a Segment renders as a radiogroup), so a keyboard user lands in the
 * value input. Ported from EmboUI's `FilteringButton`.
 */
export function firstValueField(
	root: HTMLElement | undefined
): HTMLElement | null {
	if (!root) return null;
	const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
	for (const element of focusable) {
		if (!element.closest('[role="radiogroup"]')) return element;
	}
	return null;
}

/** The filter icon button, anchoring both its tooltip and the popover. */
function FilterTrigger(props: {
	label: string;
	isActive: boolean;
	isTextFilter: boolean;
}): JSX.Element {
	return (
		<Tooltip
			tooltipContent="Filter"
			asChild={(tooltipProps) => (
				<span
					{...(tooltipProps() as object)}
					class={styles.filterTrigger}
				>
					<Popover.ClickTrigger
						asChild={(triggerProps) => (
							<button
								type="button"
								{...(triggerProps() as object)}
								aria-label={`Filter ${props.label}`}
								data-active={
									props.isActive ? "true" : undefined
								}
								class={clsx(
									iconButtonStyles.iconButton,
									props.isActive && styles.active
								)}
							>
								<Icon>
									{props.isTextFilter
										? ICONS.search
										: "filter_list"}
								</Icon>
							</button>
						)}
					/>
				</span>
			)}
		/>
	);
}

/**
 * Per-column filter control. Renders an icon button (whose accessible name is
 * `Filter <header>`) opening a Popover whose body depends on the column's
 * `meta.dataType`: string → text Input; number → exact or range NumberInputs;
 * date → exact or range DatePickers; time → exact or range TimePickers;
 * boolean → Any / Yes / No; enum → a Checkbox per option over
 * `meta.enumOptions`. The button shows as active only while the filter
 * actually constrains something: an empty range does not count.
 *
 * Ported from EmboUI's `FilteringButton`. React→Solid: the `<IconButton>` inside
 * `<Popover.ClickTrigger asChild>` is replaced by a plain button (the Popover
 * trigger) to avoid a button-in-button. EmboUI's date filter stores ISO days
 * against ISO rows; here rows hold timestamps (see `dateRangeColumnFilter`).
 */
export function FilteringButton<Data extends Record<string, unknown>>(props: {
	column: Column<Data>;
}): JSX.Element {
	const filter = createColumnFilter(props);
	let content: HTMLDivElement | undefined;

	return (
		<Popover.Root initialFocusEl={() => firstValueField(content)}>
			<FilterTrigger
				label={filter.header()}
				isActive={filter.isActive()}
				isTextFilter={filter.dataType() === "string"}
			/>
			<Popover.Content>
				<div
					ref={(element) => {
						content = element;
					}}
					class={styles.filterBody}
				>
					<FilterBody filter={filter} />
				</div>
			</Popover.Content>
		</Popover.Root>
	);
}
