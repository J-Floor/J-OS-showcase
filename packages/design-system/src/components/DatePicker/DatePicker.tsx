import { DateInput, useDateInput } from "@ark-ui/solid/date-input";
import {
	DatePicker as ArkDatePicker,
	parseDate,
	useDatePicker,
	type UseDatePickerProps,
} from "@ark-ui/solid/date-picker";
import { type JSX, Index, Show, createMemo, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";

import styles from "./DatePicker.module.scss";

/**
 * All ark `UseDatePickerProps` are forwarded to the date-picker machine, with
 * three exceptions that this wrapper owns:
 *
 * - `value` and `onValueChange` — replaced by ISO `YYYY-MM-DD` string
 *   convenience props (ark uses `DateValue[]`).
 * - `locale` — same semantics but defaults to `"en-GB"` (day/month/year).
 * - `open` / `onOpenChange` — the picker manages its own open state so that
 *   outside-click dismissal works without extra wiring; exposing these would
 *   conflict with that internal management.
 */
export type DatePickerProps = Omit<
	UseDatePickerProps,
	"value" | "onValueChange" | "locale" | "open" | "onOpenChange"
> & {
	/** Field label. */
	label?: string;
	/** BCP-47 locale controlling the segment order / format. Defaults to `en-GB`
	 * (day/month/year). */
	locale?: string;
	/** Controlled selected date as an ISO `YYYY-MM-DD` string (or null/undefined
	 * for empty). Kept in sync with the segmented input + calendar. */
	value?: string | null;
	/** Fired with the selected date as an ISO `YYYY-MM-DD` string (or null when
	 * cleared). */
	onValueChange?: (value: string | null) => void;
	/** Earliest selectable date as an ISO `YYYY-MM-DD` string. Convenience over
	 * ark's `min` (which takes a `DateValue`); earlier dates are disabled in the
	 * calendar and rejected by the segmented input. */
	minIso?: string;
	/** Latest selectable date as an ISO `YYYY-MM-DD` string (see `minIso`). */
	maxIso?: string;
	class?: string;
};

/** Props that belong to this wrapper, not forwarded to the ark machine. */
const OWN_KEYS = [
	"label",
	"locale",
	"value",
	"onValueChange",
	"minIso",
	"maxIso",
	"class",
] as const satisfies readonly (keyof DatePickerProps)[];

/**
 * Date field combining a segmented date input (type the date directly) with a
 * calendar popover (pick it visually). Wired exactly per ark's "date input with
 * date picker" pattern: the `DatePicker` machine is the single source of truth
 * and the `DateInput` machine mirrors its value and writes back through
 * `setValue` — so the two never fight over a controlled value (which is what
 * broke a naive two-Root version). Defaults to a European (day/month/year)
 * format. Built and styled from scratch (no embo equivalent).
 *
 * All `UseDatePickerProps` options (`min`, `max`, `isDateUnavailable`,
 * `selectionMode`, `disabled`, `readOnly`, `startOfWeek`, `timeZone`, etc.)
 * are forwarded to the underlying machine.
 */
export function DatePicker(props: DatePickerProps): JSX.Element {
	const [own, arkProps] = splitProps(props, OWN_KEYS);

	// Memoize the parsed min/max so their object identity is stable across
	// renders. Parsing inline in the reactive config below would mint a fresh
	// DateValue every render, which the date-picker machine reads as a changed
	// `min`/`max` and resets its internal state on — that silently breaks
	// calendar-cell selection (clicks never commit), while the segmented input
	// still works.
	const minDate = createMemo(() =>
		own.minIso ? parseDate(own.minIso) : undefined
	);
	const maxDate = createMemo(() =>
		own.maxIso ? parseDate(own.maxIso) : undefined
	);

	// Wired per ark's "date input with date picker": the DatePicker machine owns
	// the value (controlled here by `own.value`) and emits ISO to the consumer;
	// the DateInput segments mirror it (`value: datePicker().value`) and write
	// selections back via `setValue`. The picker manages its own open state, so
	// outside-click dismissal works without extra wiring.
	const datePicker = useDatePicker(() => ({
		...arkProps,
		locale: own.locale ?? "en-GB",
		min: minDate() ?? arkProps.min,
		max: maxDate() ?? arkProps.max,
		// Only CONTROL the value when the consumer actually passes one. Forcing
		// `[]` when uncontrolled made the picker controlled-empty: every click
		// was reconciled back to empty (and once `min` was set, ark rejected the
		// selection outright, so nothing happened). `undefined` lets the machine
		// own its selection; uncontrolled consumers reset by remounting.
		value: own.value ? [parseDate(own.value)] : undefined,
		onValueChange(details) {
			// Emit ISO (YYYY-MM-DD) from the DateValue, not the localized display
			// string, so a downstream ISO parser reads it correctly.
			own.onValueChange?.(details.value[0]?.toString() ?? null);
		},
	}));
	const dateInput = useDateInput(() => ({
		locale: own.locale ?? "en-GB",
		value: datePicker().value,
		onValueChange(details) {
			datePicker().setValue(details.value);
		},
	}));

	return (
		<DateInput.RootProvider
			class={own.class ? `${styles.field} ${own.class}` : styles.field}
			value={dateInput}
		>
			<Show when={own.label}>
				<DateInput.Label class={styles.label}>
					{own.label}
				</DateInput.Label>
			</Show>
			<DateInput.Control class={styles.control}>
				<ArkDatePicker.RootProvider
					class={styles.pickerRoot}
					value={datePicker}
					lazyMount
					unmountOnExit
				>
					<ArkDatePicker.Control class={styles.pickerControl}>
						<DateInput.SegmentGroup class={styles.segmentGroup}>
							{/* NOT DateInput.SegmentContext: it passes each segment
							    snapshot as a function arg, which is non-reactive in
							    Solid, so typed digits never re-render (the value
							    updates but segments stay on the placeholder).
							    Reading the Index accessor inside the `segment` JSX
							    prop keeps it reactive. */}
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
						<ArkDatePicker.Trigger class={styles.trigger}>
							<Icon>{ICONS.datePicker}</Icon>
						</ArkDatePicker.Trigger>
					</ArkDatePicker.Control>
					<Portal>
						<ArkDatePicker.Positioner>
							<ArkDatePicker.Content class={styles.content}>
								<Calendar />
							</ArkDatePicker.Content>
						</ArkDatePicker.Positioner>
					</Portal>
				</ArkDatePicker.RootProvider>
			</DateInput.Control>
			<DateInput.HiddenInput />
		</DateInput.RootProvider>
	);
}

/** Day / month / year calendar views. */
function Calendar(): JSX.Element {
	return (
		<>
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
											<ArkDatePicker.TableRow>
												<Index each={week()}>
													{(day) => (
														<ArkDatePicker.TableCell
															value={day()}
														>
															<ArkDatePicker.TableCellTrigger
																class={
																	styles.cell
																}
															>
																{day().day}
															</ArkDatePicker.TableCellTrigger>
														</ArkDatePicker.TableCell>
													)}
												</Index>
											</ArkDatePicker.TableRow>
										)}
									</Index>
								</ArkDatePicker.TableBody>
							</ArkDatePicker.Table>
						</>
					)}
				</ArkDatePicker.Context>
			</ArkDatePicker.View>

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
											<ArkDatePicker.TableRow>
												<Index each={months()}>
													{(month) => (
														<ArkDatePicker.TableCell
															value={
																month().value
															}
														>
															<ArkDatePicker.TableCellTrigger
																class={
																	styles.cell
																}
															>
																{month().label}
															</ArkDatePicker.TableCellTrigger>
														</ArkDatePicker.TableCell>
													)}
												</Index>
											</ArkDatePicker.TableRow>
										)}
									</Index>
								</ArkDatePicker.TableBody>
							</ArkDatePicker.Table>
						</>
					)}
				</ArkDatePicker.Context>
			</ArkDatePicker.View>

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
											<ArkDatePicker.TableRow>
												<Index each={years()}>
													{(year) => (
														<ArkDatePicker.TableCell
															value={year().value}
														>
															<ArkDatePicker.TableCellTrigger
																class={
																	styles.cell
																}
															>
																{year().label}
															</ArkDatePicker.TableCellTrigger>
														</ArkDatePicker.TableCell>
													)}
												</Index>
											</ArkDatePicker.TableRow>
										)}
									</Index>
								</ArkDatePicker.TableBody>
							</ArkDatePicker.Table>
						</>
					)}
				</ArkDatePicker.Context>
			</ArkDatePicker.View>
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
