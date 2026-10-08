import type { Column } from "@tanstack/solid-table";
import clsx from "clsx";
import { type Component, type JSX, For, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { Checkbox } from "../Checkbox/Checkbox.tsx";
import { DatePicker } from "../DatePicker/DatePicker.tsx";
import { Icon } from "../Icon/Icon.tsx";
import iconButtonStyles from "../IconButton/IconButton.module.scss";
import { Input } from "../Input/Input.tsx";
import { NumberInput } from "../NumberInput/NumberInput.tsx";
import { Popover } from "../Popover/Popover.tsx";
import { Segment } from "../Segment/Segment.tsx";
import { TimePicker } from "../TimePicker/TimePicker.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import { columnLabel } from "./columnLabel.ts";
import {
	booleanFilter,
	booleanSegment,
	enumFilterValueFromIds,
	enumOptionId,
	exactFilter,
	filterIsActive,
	rangeFilter,
	selectedEnumOptionIds,
	switchRangeMode,
	type FilterMode,
	type RangeFilterValue,
} from "./filter.ts";
import { columnMeta } from "./hooks.ts";
import styles from "./Table.module.scss";
import type { DataType, EnumOption, EnumValue } from "./types.ts";

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
	for (const el of Array.from(
		root.querySelectorAll<HTMLElement>(FOCUSABLE)
	)) {
		if (!el.closest('[role="radiogroup"]')) return el;
	}
	return null;
}

/** The Exact / Range toggle of a number, date or time filter. */
function ModeToggle(props: {
	mode: FilterMode;
	onChange: (mode: FilterMode) => void;
}): JSX.Element {
	return (
		<Segment.Root
			value={props.mode}
			onValueChange={(details) => {
				if (details.value === "exact" || details.value === "range")
					props.onChange(details.value);
			}}
		>
			<Segment.Item value="exact">Exact</Segment.Item>
			<Segment.Item value="range">Range</Segment.Item>
		</Segment.Root>
	);
}

/** What a range filter hands the input for one bound: its text, or
 *  `undefined` when empty. */
type BoundInputProps = {
	label: string;
	placeholder: string;
	value: string | undefined;
	onChange: (value: string | undefined) => void;
};

function NumberBound(props: BoundInputProps): JSX.Element {
	return (
		<NumberInput
			label={props.label}
			placeholder={props.placeholder}
			onlyAllowTyping
			value={props.value ?? ""}
			onValueChange={(details) => {
				props.onChange(
					details.value === "" ? undefined : details.value
				);
			}}
		/>
	);
}

function DateBound(props: BoundInputProps): JSX.Element {
	return (
		<DatePicker
			label={props.label}
			value={props.value ?? null}
			onValueChange={(iso) => {
				props.onChange(iso ?? undefined);
			}}
		/>
	);
}

function TimeBound(props: BoundInputProps): JSX.Element {
	return (
		<TimePicker
			label={props.label}
			value={props.value ?? null}
			onValueChange={(time) => {
				props.onChange(time ?? undefined);
			}}
		/>
	);
}

/** The input and range labels of each range-filtered `dataType`. */
type RangeKind = {
	input: Component<BoundInputProps>;
	from: string;
	to: string;
};

const RANGE_KINDS: Partial<Record<DataType["dataType"], RangeKind>> = {
	number: { input: NumberBound, from: "Min", to: "Max" },
	date: { input: DateBound, from: "From", to: "To" },
	time: { input: TimeBound, from: "From", to: "To" },
};

/** A number, date or time filter: the Exact / Range toggle over one input, or
 *  two for a range's bounds. */
function RangeFilter(props: {
	title: string;
	kind: RangeKind;
	value: RangeFilterValue<string> | undefined;
	onChange: (value: RangeFilterValue<string> | undefined) => void;
}): JSX.Element {
	function exact(): string | undefined {
		return props.value?.mode === "exact" ? props.value.value : undefined;
	}
	function bound(which: "from" | "to"): string | undefined {
		return props.value?.mode === "range" ? props.value[which] : undefined;
	}
	return (
		<>
			<h5 class={styles.filterTitle}>{props.title}</h5>
			<ModeToggle
				mode={props.value?.mode ?? "exact"}
				onChange={(mode) => {
					props.onChange(switchRangeMode(props.value, mode));
				}}
			/>
			<Show
				when={props.value?.mode === "range"}
				fallback={
					<Dynamic
						component={props.kind.input}
						label={props.title}
						placeholder="Enter filter value"
						value={exact()}
						onChange={(value: string | undefined) => {
							props.onChange(exactFilter(value));
						}}
					/>
				}
			>
				<Dynamic
					component={props.kind.input}
					label={props.kind.from}
					placeholder={props.kind.from}
					value={bound("from")}
					onChange={(value: string | undefined) => {
						props.onChange(rangeFilter(value, bound("to")));
					}}
				/>
				<Dynamic
					component={props.kind.input}
					label={props.kind.to}
					placeholder={props.kind.to}
					value={bound("to")}
					onChange={(value: string | undefined) => {
						props.onChange(rangeFilter(bound("from"), value));
					}}
				/>
			</Show>
		</>
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
	function dataType(): DataType["dataType"] | undefined {
		return columnMeta(props.column).dataType;
	}
	function enumOptions(): readonly EnumOption<EnumValue>[] | undefined {
		const meta = columnMeta(props.column);
		return meta.dataType === "enum" ? meta.enumOptions : undefined;
	}
	function rangeKind(): RangeKind | undefined {
		const type = dataType();
		return type === undefined ? undefined : RANGE_KINDS[type];
	}
	function header(): string {
		return columnLabel(props.column);
	}
	function filterValue(): unknown {
		return props.column.getFilterValue();
	}
	function setFilter(value: unknown): void {
		props.column.setFilterValue(value);
	}
	function active(): boolean {
		return filterIsActive(dataType(), filterValue());
	}

	let content: HTMLDivElement | undefined;

	function ResetButton(): JSX.Element {
		return (
			<Button
				variant="tertiary"
				disabled={!active()}
				disabledReason="No filter to reset"
				onClick={() => {
					setFilter(undefined);
				}}
			>
				<Icon>{ICONS.reset}</Icon>
				Reset
			</Button>
		);
	}

	return (
		<Popover.Root initialFocusEl={() => firstValueField(content)}>
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
									aria-label={`Filter ${header()}`}
									data-active={active() ? "true" : undefined}
									class={clsx(
										iconButtonStyles.iconButton,
										active() && styles.active
									)}
								>
									<Icon>
										{dataType() === "string"
											? ICONS.search
											: "filter_list"}
									</Icon>
								</button>
							)}
						/>
					</span>
				)}
			/>
			<Popover.Content>
				<div
					ref={(el) => {
						content = el;
					}}
					class={styles.filterBody}
				>
					<Switch>
						<Match when={dataType() === "string"}>
							<Input
								label={header()}
								placeholder="Enter filter text"
								value={
									(filterValue() as string | undefined) ?? ""
								}
								onValueChange={(event) => {
									const text = event.currentTarget.value;
									setFilter(text === "" ? undefined : text);
								}}
							/>
						</Match>
						<Match when={rangeKind()}>
							{(kind) => (
								<>
									<RangeFilter
										title={header()}
										kind={kind()}
										value={
											filterValue() as
												| RangeFilterValue<string>
												| undefined
										}
										onChange={setFilter}
									/>
									<ResetButton />
								</>
							)}
						</Match>
						<Match when={dataType() === "boolean"}>
							<h5 class={styles.filterTitle}>{header()}</h5>
							<Segment.Root
								value={booleanSegment(filterValue())}
								onValueChange={(details) => {
									setFilter(booleanFilter(details.value));
								}}
							>
								<Segment.Item value="any">Any</Segment.Item>
								<Segment.Item value="true">Yes</Segment.Item>
								<Segment.Item value="false">No</Segment.Item>
							</Segment.Root>
						</Match>
						<Match when={dataType() === "enum" && enumOptions()}>
							{(options) => {
								function selected(): string[] {
									return selectedEnumOptionIds(
										options(),
										filterValue()
									);
								}
								function toggle(id: string, checked: boolean) {
									const current = selected();
									const next = checked
										? [...current, id]
										: current.filter((v) => v !== id);
									if (next.length === 0) {
										setFilter([""]);
									} else if (
										next.length === options().length
									) {
										setFilter(undefined);
									} else {
										setFilter(
											enumFilterValueFromIds(
												options(),
												next
											)
										);
									}
								}
								return (
									<>
										<h5 class={styles.filterTitle}>
											{header()}
										</h5>
										<div class={styles.enumOptions}>
											<For each={options()}>
												{(option) => (
													<Checkbox
														checked={selected().includes(
															enumOptionId(option)
														)}
														onCheckedChange={(
															d
														) => {
															toggle(
																enumOptionId(
																	option
																),
																d.checked ===
																	true
															);
														}}
													>
														{option.label}
													</Checkbox>
												)}
											</For>
										</div>
										<Button
											variant="tertiary"
											disabled={!active()}
											disabledReason="All values are already shown"
											onClick={() => {
												setFilter(undefined);
											}}
										>
											<Icon>{ICONS.reset}</Icon>
											Show all values
										</Button>
									</>
								);
							}}
						</Match>
					</Switch>
				</div>
			</Popover.Content>
		</Popover.Root>
	);
}
