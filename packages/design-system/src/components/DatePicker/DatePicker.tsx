import { DateInput, useDateInput } from "@ark-ui/solid/date-input";
import {
	DatePicker as ArkDatePicker,
	type DateValue,
	parseDate,
	useDatePicker,
	type UseDatePickerProps,
} from "@ark-ui/solid/date-picker";
import {
	type Accessor,
	type ComponentProps,
	type JSX,
	Index,
	createMemo,
	createUniqueId,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import {
	firstEditableSegment,
	isEditableSegment,
} from "../../utils/dateSegments.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import {
	fieldBoxHandlers,
	splitMakeFieldProps,
} from "../../utils/makeFieldProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import type { MakeFieldOwnProps } from "../../utils/types.ts";
import { Icon } from "../Icon/Icon.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./DatePicker.module.scss";

const DEFAULT_LOCALE = "en-GB";

/**
 * The MakeField props (label, helper/error text, invalid, required, the
 * disabling set) plus every ark `UseDatePickerProps` option, with these
 * exceptions that the wrapper owns:
 *
 * - `value` and `onValueChange`: replaced by ISO `YYYY-MM-DD` string
 *   convenience props (ark uses `DateValue[]`).
 * - `open` / `onOpenChange`: the picker manages its own open state so that
 *   outside-click dismissal works without extra wiring; exposing these would
 *   conflict with that internal management.
 * - the field semantics (`disabled`, `invalid`, `required`, `readOnly`, `ids`)
 *   come from the MakeField side and are handed to both machines.
 *
 * `locale` keeps ark's type and defaults to `en-GB` (day/month/year).
 */
export type DatePickerProps = PropsWithDisabling<
	Omit<MakeFieldOwnProps, "ids"> &
		Pick<MakeFieldProps, "class"> &
		Omit<
			UseDatePickerProps,
			| "value"
			| "onValueChange"
			| "open"
			| "onOpenChange"
			| "disabled"
			| "invalid"
			| "required"
			| "readOnly"
		> & {
			/** Controlled selected date as an ISO `YYYY-MM-DD` string (or
			 *  null/undefined for empty). Kept in sync with the segmented
			 *  input + calendar. */
			value?: string | null;
			/** Fired with the selected date as an ISO `YYYY-MM-DD` string (or
			 *  null when cleared). */
			onValueChange?: (value: string | null) => void;
			/** Earliest selectable date as an ISO `YYYY-MM-DD` string.
			 *  Convenience over ark's `min` (which takes a `DateValue`);
			 *  earlier dates are disabled in the calendar and rejected by the
			 *  segmented input. */
			minIso?: string;
			/** Latest selectable date as an ISO `YYYY-MM-DD` string (see
			 *  `minIso`). */
			maxIso?: string;
		} & WithPartClasses<
			| "label"
			| "helperText"
			| "errorText"
			| "requiredIndicator"
			| "content"
			| "positioner"
		>
>;

/** Props that belong to this wrapper, not forwarded to the ark machine. */
const OWN_KEYS = [
	"locale",
	"value",
	"onValueChange",
	"minIso",
	"maxIso",
] as const satisfies readonly (keyof DatePickerProps)[];

/** The machine's value for the ISO `value` prop: `undefined` (no prop)
 *  leaves the picker uncontrolled, `null` or `""` is a controlled empty. */
function controlledValue(
	value: string | null | undefined
): DateValue[] | undefined {
	if (value === undefined) return undefined;
	return value ? [parseDate(value)] : [];
}

/**
 * An optional ISO `YYYY-MM-DD` prop parsed to a date, memoized so its
 * identity is stable across renders. Parsing inline in the reactive machine
 * config would mint a fresh DateValue every render, which the date-picker
 * machine reads as a changed `min`/`max` and resets its internal state on:
 * that silently breaks calendar-cell selection (clicks never commit), while
 * the segmented input still works.
 */
function createIsoDate(
	iso: () => string | undefined
): Accessor<DateValue | undefined> {
	const date = createMemo(() => {
		const value = iso();
		return value ? parseDate(value) : undefined;
	});
	return date;
}

/**
 * Date field combining a segmented date input (type the date directly) with a
 * calendar popover (pick it visually), inside `MakeField` (label, helper and
 * error text, invalid, required, disabled reason). Wired exactly per ark's
 * "date input with date picker" pattern: the `DatePicker` machine is the
 * single source of truth and the `DateInput` machine mirrors its value and
 * writes back through `setValue`, so the two never fight over a controlled
 * value (which is what broke a naive two-Root version). Defaults to a
 * European (day/month/year) format. Built and styled from scratch (no embo
 * equivalent).
 *
 * Neither machine reads Field's context, so `disabled`/`invalid`/`required`/
 * `readOnly` are handed to both: the MakeField dim alone only blocks the
 * pointer. The calendar stays mounted once opened (`lazyMount` without
 * `unmountOnExit`) so it animates out.
 */
export function DatePicker(props: DatePickerProps): JSX.Element {
	let segmentGroupElement: HTMLDivElement | undefined;
	// MakeField's label names the segment group, so both machines share it.
	const labelId = createUniqueId();

	const [own, rest] = splitArkProps(props, OWN_KEYS);
	const [makeFieldProps, arkProps] = splitMakeFieldProps(rest);
	function locale(): string {
		return own.locale ?? DEFAULT_LOCALE;
	}

	const minDate = createIsoDate(() => own.minIso);
	const maxDate = createIsoDate(() => own.maxIso);

	// Wired per ark's "date input with date picker": the DatePicker machine owns
	// the value (controlled here by `own.value`) and emits ISO to the consumer;
	// the DateInput segments mirror it (`value: datePicker().value`) and write
	// selections back via `setValue`. The picker manages its own open state, so
	// outside-click dismissal works without extra wiring.
	const datePicker = useDatePicker(() => ({
		...arkProps,
		locale: locale(),
		min: minDate() ?? arkProps.min,
		max: maxDate() ?? arkProps.max,
		disabled: makeFieldProps.disabled,
		invalid: makeFieldProps.invalid,
		required: makeFieldProps.required,
		// Only CONTROL the value when the consumer passes one: no `value` prop
		// (`undefined`) lets the machine own its selection, while a controlled
		// `null` is an empty value and must clear the shown date.
		value: controlledValue(own.value),
		onValueChange(details) {
			// Emit ISO (YYYY-MM-DD) from the DateValue, not the localized display
			// string, so a downstream ISO parser reads it correctly.
			own.onValueChange?.(details.value[0]?.toString() ?? null);
		},
	}));
	const dateInput = useDateInput(() => ({
		ids: { label: () => labelId },
		locale: locale(),
		name: arkProps.name,
		disabled: makeFieldProps.disabled,
		invalid: makeFieldProps.invalid,
		required: makeFieldProps.required,
		readOnly: arkProps.readOnly,
		value: datePicker().value,
		onValueChange(details) {
			datePicker().setValue(details.value);
		},
	}));

	function focusFirstSegment(): void {
		firstEditableSegment(segmentGroupElement)?.focus();
	}

	return (
		<MakeField
			{...makeFieldProps}
			ids={{ label: labelId }}
			onLabelClicked={focusFirstSegment}
			focusField={focusFirstSegment}
		>
			<DateInput.RootProvider class={styles.root} value={dateInput}>
				<DateInput.Control class={styles.control}>
					<ArkDatePicker.RootProvider
						class={styles.pickerRoot}
						value={datePicker}
						lazyMount
					>
						<ArkDatePicker.Control
							class={styles.pickerControl}
							{...fieldBoxHandlers(
								() => firstEditableSegment(segmentGroupElement),
								isEditableSegment
							)}
							data-invalid={
								makeFieldProps.invalid ? "true" : undefined
							}
						>
							<Segments
								ref={(element) => {
									segmentGroupElement = element;
								}}
							/>
							<ArkDatePicker.Trigger class={styles.trigger}>
								<Icon>{ICONS.datePicker}</Icon>
							</ArkDatePicker.Trigger>
						</ArkDatePicker.Control>
						<CalendarPopover classOverride={props.classOverride} />
					</ArkDatePicker.RootProvider>
				</DateInput.Control>
				<DateInput.HiddenInput />
			</DateInput.RootProvider>
		</MakeField>
	);
}

/**
 * The editable date segments, rendered through `Index` so they stay reactive.
 * NOT `DateInput.SegmentContext`: it passes each segment snapshot as a
 * function arg, which is non-reactive in Solid, so typed digits never
 * re-render (the value updates but segments stay on the placeholder). Reading
 * the Index accessor inside the `segment` JSX prop keeps it reactive.
 */
function Segments(props: {
	ref: (element: HTMLDivElement) => void;
}): JSX.Element {
	return (
		<DateInput.SegmentGroup ref={props.ref} class={styles.segmentGroup}>
			<DateInput.Context>
				{(api) => (
					<Index each={api().getSegments()}>
						{(segment) => (
							<DateInput.Segment
								class={styles.segment}
								segment={segment()}
							/>
						)}
					</Index>
				)}
			</DateInput.Context>
		</DateInput.SegmentGroup>
	);
}

/** The calendar, portalled; it stays mounted once opened so it animates out. */
function CalendarPopover(
	props: WithPartClasses<"content" | "positioner">
): JSX.Element {
	return (
		<Portal>
			<ArkDatePicker.Positioner
				class={getPartStyles(styles, props, "positioner")}
			>
				<ArkDatePicker.Content
					class={getPartStyles(styles, props, "content")}
				>
					<Calendar />
				</ArkDatePicker.Content>
			</ArkDatePicker.Positioner>
		</Portal>
	);
}

/** The day view of the calendar. */
function DayView(): JSX.Element {
	return (
		<ArkDatePicker.View view="day" class={styles.view}>
			<ArkDatePicker.Context>
				{(api) => (
					<>
						<ViewControl />
						<ArkDatePicker.Table class={styles.table}>
							<ArkDatePicker.TableHead>
								<ArkDatePicker.TableRow>
									<Index each={api().weekDays}>
										{(weekDay) => (
											<ArkDatePicker.TableHeader
												class={styles.weekday}
											>
												{weekDay().short}
											</ArkDatePicker.TableHeader>
										)}
									</Index>
								</ArkDatePicker.TableRow>
							</ArkDatePicker.TableHead>
							<ArkDatePicker.TableBody>
								<Index each={api().weeks}>
									{(week) => (
										<CellRow
											cells={week()}
											value={(day) => day}
											label={(day) => day.day}
										/>
									)}
								</Index>
							</ArkDatePicker.TableBody>
						</ArkDatePicker.Table>
					</>
				)}
			</ArkDatePicker.Context>
		</ArkDatePicker.View>
	);
}

/** One row of a calendar view's grid: a pickable cell per day, month or
 *  year, carrying its `value` and showing its `label`. */
function CellRow<Cell>(props: {
	cells: Cell[];
	value: (
		cell: Cell
	) => ComponentProps<typeof ArkDatePicker.TableCell>["value"];
	label: (cell: Cell) => JSX.Element;
}): JSX.Element {
	return (
		<ArkDatePicker.TableRow>
			<Index each={props.cells}>
				{(cell) => (
					<ArkDatePicker.TableCell value={props.value(cell())}>
						<ArkDatePicker.TableCellTrigger class={styles.cell}>
							{props.label(cell())}
						</ArkDatePicker.TableCellTrigger>
					</ArkDatePicker.TableCell>
				)}
			</Index>
		</ArkDatePicker.TableRow>
	);
}

/** The month view of the calendar. */
function MonthView(): JSX.Element {
	return (
		<ArkDatePicker.View view="month" class={styles.view}>
			<ArkDatePicker.Context>
				{(api) => (
					<>
						<ViewControl />
						<ArkDatePicker.Table class={styles.table}>
							<ArkDatePicker.TableBody>
								<Index
									each={api().getMonthsGrid({
										columns: 4,
										format: "short",
									})}
								>
									{(months) => (
										<CellRow
											cells={months()}
											value={(month) => month.value}
											label={(month) => month.label}
										/>
									)}
								</Index>
							</ArkDatePicker.TableBody>
						</ArkDatePicker.Table>
					</>
				)}
			</ArkDatePicker.Context>
		</ArkDatePicker.View>
	);
}

/** The year view of the calendar. */
function YearView(): JSX.Element {
	return (
		<ArkDatePicker.View view="year" class={styles.view}>
			<ArkDatePicker.Context>
				{(api) => (
					<>
						<ViewControl />
						<ArkDatePicker.Table class={styles.table}>
							<ArkDatePicker.TableBody>
								<Index
									each={api().getYearsGrid({
										columns: 4,
									})}
								>
									{(years) => (
										<CellRow
											cells={years()}
											value={(year) => year.value}
											label={(year) => year.label}
										/>
									)}
								</Index>
							</ArkDatePicker.TableBody>
						</ArkDatePicker.Table>
					</>
				)}
			</ArkDatePicker.Context>
		</ArkDatePicker.View>
	);
}

/** Day / month / year calendar views. */
function Calendar(): JSX.Element {
	return (
		<>
			<DayView />
			<MonthView />
			<YearView />
		</>
	);
}

/** Prev / view-switch / next header, shared across the three views. */
function ViewControl(): JSX.Element {
	return (
		<div class={styles.viewControl}>
			<ArkDatePicker.PrevTrigger class={styles.navTrigger}>
				<Icon>chevron_left</Icon>
			</ArkDatePicker.PrevTrigger>
			<ArkDatePicker.ViewTrigger class={styles.viewTrigger}>
				<ArkDatePicker.RangeText />
			</ArkDatePicker.ViewTrigger>
			<ArkDatePicker.NextTrigger class={styles.navTrigger}>
				<Icon>chevron_right</Icon>
			</ArkDatePicker.NextTrigger>
		</div>
	);
}
