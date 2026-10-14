import { type Component, type JSX, For, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { Checkbox } from "../Checkbox/Checkbox.tsx";
import { DatePicker } from "../DatePicker/DatePicker.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { Input } from "../Input/Input.tsx";
import { NumberInput } from "../NumberInput/NumberInput.tsx";
import { Segment } from "../Segment/Segment.tsx";
import { TimePicker } from "../TimePicker/TimePicker.tsx";

import type { ColumnFilterState } from "./columnFilterState.ts";
import {
	booleanFilter,
	booleanSegment,
	enumFilterValueFromIds,
	enumOptionId,
	exactFilter,
	rangeFilter,
	selectedEnumOptionIds,
	switchRangeMode,
	type FilterMode,
	type RangeFilterValue,
} from "./filter.ts";
import styles from "./Table.module.scss";
import type { DataType, EnumOption, EnumValue } from "./types.ts";

/** The per-`dataType` bodies of a column's filter popover. */

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

/** The reset button under a range filter. */
function ResetButton(props: {
	isActive: boolean;
	onReset: () => void;
}): JSX.Element {
	return (
		<Button
			variant="tertiary"
			disabled={!props.isActive}
			disabledReason="No filter to reset"
			onClick={props.onReset}
		>
			<Icon>{ICONS.reset}</Icon>
			Reset
		</Button>
	);
}

/** A text column's filter: a substring typed into an input. */
function TextFilter(props: {
	title: string;
	value: unknown;
	onChange: (value: unknown) => void;
}): JSX.Element {
	return (
		<Input
			label={props.title}
			placeholder="Enter filter text"
			value={(props.value as string | undefined) ?? ""}
			onValueChange={(event) => {
				const text = event.currentTarget.value;
				props.onChange(text === "" ? undefined : text);
			}}
		/>
	);
}

/** A boolean column's filter: Any / Yes / No. */
function BooleanFilter(props: {
	title: string;
	value: unknown;
	onChange: (value: unknown) => void;
}): JSX.Element {
	return (
		<>
			<h5 class={styles.filterTitle}>{props.title}</h5>
			<Segment.Root
				value={booleanSegment(props.value)}
				onValueChange={(details) => {
					props.onChange(booleanFilter(details.value));
				}}
			>
				<Segment.Item value="any">Any</Segment.Item>
				<Segment.Item value="true">Yes</Segment.Item>
				<Segment.Item value="false">No</Segment.Item>
			</Segment.Root>
		</>
	);
}

/** An enum column's filter: a checkbox per option. */
function EnumFilter(props: {
	title: string;
	options: readonly EnumOption<EnumValue>[];
	value: unknown;
	isActive: boolean;
	onChange: (value: unknown) => void;
}): JSX.Element {
	function selected(): string[] {
		return selectedEnumOptionIds(props.options, props.value);
	}
	function toggle(id: string, isChecked: boolean) {
		const current = selected();
		const next = isChecked
			? [...current, id]
			: current.filter((entry) => entry !== id);
		if (next.length === 0) {
			props.onChange([""]);
		} else if (next.length === props.options.length) {
			props.onChange(undefined);
		} else {
			props.onChange(enumFilterValueFromIds(props.options, next));
		}
	}
	return (
		<>
			<h5 class={styles.filterTitle}>{props.title}</h5>
			<div class={styles.enumOptions}>
				<For each={props.options}>
					{(option) => (
						<Checkbox
							checked={selected().includes(enumOptionId(option))}
							onCheckedChange={(details) => {
								toggle(
									enumOptionId(option),
									details.checked === true
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
				disabled={!props.isActive}
				disabledReason="All values are already shown"
				onClick={() => {
					props.onChange(undefined);
				}}
			>
				<Icon>{ICONS.reset}</Icon>
				Show all values
			</Button>
		</>
	);
}

/** The filter control for the column's `dataType`. */
export function FilterBody(props: { filter: ColumnFilterState }): JSX.Element {
	function rangeKind(): RangeKind | undefined {
		const type = props.filter.dataType();
		return type === undefined ? undefined : RANGE_KINDS[type];
	}
	return (
		<Switch>
			<Match when={props.filter.dataType() === "string"}>
				<TextFilter
					title={props.filter.header()}
					value={props.filter.filterValue()}
					onChange={props.filter.setFilter}
				/>
			</Match>
			<Match when={rangeKind()}>
				{(kind) => (
					<>
						<RangeFilter
							title={props.filter.header()}
							kind={kind()}
							value={
								props.filter.filterValue() as
									| RangeFilterValue<string>
									| undefined
							}
							onChange={props.filter.setFilter}
						/>
						<ResetButton
							isActive={props.filter.isActive()}
							onReset={props.filter.clearFilter}
						/>
					</>
				)}
			</Match>
			<Match when={props.filter.dataType() === "boolean"}>
				<BooleanFilter
					title={props.filter.header()}
					value={props.filter.filterValue()}
					onChange={props.filter.setFilter}
				/>
			</Match>
			<Match
				when={
					props.filter.dataType() === "enum" &&
					props.filter.enumOptions()
				}
			>
				{(options) => (
					<EnumFilter
						title={props.filter.header()}
						options={options()}
						value={props.filter.filterValue()}
						isActive={props.filter.isActive()}
						onChange={props.filter.setFilter}
					/>
				)}
			</Match>
		</Switch>
	);
}
