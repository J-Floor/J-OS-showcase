import type { Column } from "@tanstack/solid-table";
import clsx from "clsx";
import { type JSX, For, Show } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Button } from "../Button/Button.tsx";
import { Checkbox } from "../Checkbox/Checkbox.tsx";
import { DatePicker } from "../DatePicker/DatePicker.tsx";
import { Icon } from "../Icon/Icon.tsx";
import iconButtonStyles from "../IconButton/IconButton.module.scss";
import { Input } from "../Input/Input.tsx";
import { NumberInput } from "../NumberInput/NumberInput.tsx";
import { Popover } from "../Popover/Popover.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Table.module.scss";
import type { DataType, EnumOption } from "./types.ts";

/**
 * Per-column filter control. Renders an icon button (whose accessible name is
 * `Filter <header>`) opening a Popover whose body depends on the column's
 * `meta.dataType`: string → text Input, number → NumberInput, enum → a Checkbox
 * list over `meta.enumOptions`, date → two DatePickers (from/to).
 *
 * Ported from EmboUI's `FilteringButton`. React→Solid: the `<IconButton>` inside
 * `<Popover.ClickTrigger asChild>` is replaced by a `<BaseButton>` (the Popover
 * trigger) to avoid a button-in-button; the boolean Segment dataType is omitted
 * (no Segment component in this package) — boolean columns simply render no body.
 */
export function FilteringButton<Data extends Record<string, unknown>>(props: {
	column: Column<Data>;
}): JSX.Element {
	function meta(): DataType | undefined {
		return props.column.columnDef.meta as DataType | undefined;
	}
	function dataType(): DataType["dataType"] | undefined {
		return meta()?.dataType;
	}
	function enumOptions(): readonly EnumOption[] | undefined {
		const m = meta();
		return m && "enumOptions" in m ? m.enumOptions : undefined;
	}
	function header(): string {
		return String(props.column.columnDef.header ?? "");
	}
	function filterValue(): unknown {
		return props.column.getFilterValue();
	}

	function dateBounds(): [string, string] {
		const v = filterValue();
		if (Array.isArray(v)) {
			return [String(v[0] ?? ""), String(v[1] ?? "")];
		}
		return ["", ""];
	}

	return (
		<Popover.Root>
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
									class={clsx(
										iconButtonStyles.iconButton,
										props.column.getIsFiltered() &&
											styles.active
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
				<div class={styles.filterBody}>
					<Show when={dataType() === "string"}>
						<Input
							label={header()}
							placeholder="Enter filter text"
							value={(filterValue() as string | undefined) ?? ""}
							onValueChange={(event) => {
								props.column.setFilterValue(
									event.currentTarget.value
								);
							}}
						/>
					</Show>
					<Show when={dataType() === "number"}>
						<NumberInput
							label={header()}
							placeholder="Enter filter value"
							value={filterValue() ? String(filterValue()) : ""}
							onValueChange={(details) => {
								props.column.setFilterValue(
									details.value === "" ? "" : details.value
								);
							}}
						/>
						<Button
							variant="tertiary"
							disabled={!props.column.getIsFiltered()}
							disabledReason="No filter to reset"
							onClick={() => {
								props.column.setFilterValue(undefined);
							}}
						>
							<Icon>{ICONS.reset}</Icon>
							Reset
						</Button>
					</Show>
					<Show when={dataType() === "date"}>
						<DatePicker
							label={`${header()} from`}
							value={dateBounds()[0] || null}
							onValueChange={(iso) => {
								props.column.setFilterValue([
									iso ?? "",
									dateBounds()[1],
								]);
							}}
						/>
						<DatePicker
							label={`${header()} to`}
							value={dateBounds()[1] || null}
							onValueChange={(iso) => {
								props.column.setFilterValue([
									dateBounds()[0],
									iso ?? "",
								]);
							}}
						/>
					</Show>
					<Show when={dataType() === "enum" && enumOptions()}>
						{(options) => {
							function selected(): string[] {
								const v = filterValue();
								return Array.isArray(v)
									? (v as string[])
									: options().map((o) => o.value);
							}
							function toggle(value: string, checked: boolean) {
								const current = selected();
								const next = checked
									? [...current, value]
									: current.filter((v) => v !== value);
								if (next.length === 0) {
									props.column.setFilterValue([""]);
								} else if (next.length === options().length) {
									props.column.setFilterValue(undefined);
								} else {
									props.column.setFilterValue(next);
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
														option.value
													)}
													onCheckedChange={(d) => {
														toggle(
															option.value,
															d.checked === true
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
										disabled={!props.column.getIsFiltered()}
										disabledReason="All values are already shown"
										onClick={() => {
											props.column.setFilterValue(
												undefined
											);
										}}
									>
										<Icon>{ICONS.reset}</Icon>
										Show all values
									</Button>
								</>
							);
						}}
					</Show>
				</div>
			</Popover.Content>
		</Popover.Root>
	);
}
