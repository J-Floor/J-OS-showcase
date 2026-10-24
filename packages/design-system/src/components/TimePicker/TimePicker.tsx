import {
	DateInput,
	useDateInput,
	type UseDateInputContext,
} from "@ark-ui/solid/date-input";
import { type Time } from "@internationalized/date";
import {
	type JSX,
	Index,
	createEffect,
	createMemo,
	createSignal,
} from "solid-js";

import { ICONS } from "../../icons.ts";
import { type PropsWithDisabling } from "../../utils/disablingProps.ts";
import { splitMakeFieldProps } from "../../utils/makeFieldProps.ts";
import { splitArkProps } from "../../utils/splitArkProps.ts";
import type { MakeFieldOwnProps } from "../../utils/types.ts";
import { Icon } from "../Icon/Icon.tsx";
import { MakeField, type MakeFieldProps } from "../MakeField/MakeField.tsx";

import styles from "./TimePicker.module.scss";
import {
	buildTimeFormatter,
	EPOCH_PLACEHOLDER,
	formatHHMM,
	isWithinWindow,
	parseHHMM,
	timeToValue,
	valueToTime,
} from "./timeValue.ts";

// The field is always displayed 24-hour (h23) regardless of locale; this only
// controls which numeral glyphs render. No public prop for it (not part of
// this component's contract) — fixed to match DatePicker's default.
const LOCALE = "en-GB";

const DEFAULT_OUT_OF_RANGE_TEXT = "This time is outside the allowed range.";

export type TimePickerProps = PropsWithDisabling<
	MakeFieldOwnProps &
		Pick<MakeFieldProps, "class"> & {
			/** Controlled value as a 24-hour `"HH:MM"` string, or `null` when empty. */
			value?: string | null;
			/** Fired with the selected time as `"HH:MM"` (or `null` when cleared). */
			onValueChange?: (value: string | null) => void;
			/**
			 * Earliest selectable time (inclusive), as `"HH:MM"`. An out-of-window
			 * entry marks the field invalid rather than being clamped/rejected.
			 */
			minTime?: string;
			/** Latest selectable time (inclusive), as `"HH:MM"` (see `minTime`). */
			maxTime?: string;
		}
>;

const OWN_KEYS = [
	"value",
	"onValueChange",
	"minTime",
	"maxTime",
] as const satisfies readonly (keyof TimePickerProps)[];

/** Parses a controlled `"HH:MM"` prop into the machine's `DateValue[]` shape. */
function toControlledValue(value: string | null | undefined) {
	if (!value) return;
	const time = parseHHMM(value);
	return time ? [timeToValue(time, "minute")] : undefined;
}

/** `HH:MM` as a time, or `undefined` for no value or an unparseable one. */
function parseOptionalHHMM(value: string | null | undefined): Time | undefined {
	return value ? (parseHHMM(value) ?? undefined) : undefined;
}

/** The editable segments, rendered through `Index` so they stay reactive. */
function Segments(props: { api: UseDateInputContext }): JSX.Element {
	return (
		<Index each={props.api().getSegments()}>
			{(segment) => (
				<DateInput.Segment class={styles.segment} segment={segment()} />
			)}
		</Index>
	);
}

const EDITABLE_SEGMENT = "[data-part=segment][data-editable]";

function isEditableSegment(element: HTMLElement): boolean {
	return element.closest(EDITABLE_SEGMENT) !== null;
}

function focusFirstEditableSegment(control: HTMLElement | undefined): void {
	control?.querySelector<HTMLElement>(EDITABLE_SEGMENT)?.focus();
}

/**
 * Segmented 24-hour `HH:MM` time field: `MakeField` (label/helper/error)
 * wrapping `@ark-ui/solid`'s `DateInput`, restricted to hour+minute segments
 * (no calendar — see `DatePicker` for a date field with one). The public value
 * is a plain `"HH:MM"` string; `@internationalized/date`'s `Time` stays an
 * internal implementation detail (bridged via `timeValue.ts`).
 *
 * Ported from EmboUI's `TimeInput` (React → Solid): no `forwardRef`; segments
 * are rendered via `DateInput.Context` + `Index` (NOT `DateInput.SegmentContext`
 * — see `DatePicker.tsx` for why that isn't reactive in Solid). `min`/`max` are
 * deliberately NOT forwarded to the machine, which would silently clamp an
 * out-of-range entry; instead an out-of-window value marks the field invalid
 * (mirroring EmboUI).
 */
export function TimePicker(props: TimePickerProps): JSX.Element {
	let controlElement: HTMLDivElement | undefined;

	const [own, rest] = splitArkProps(props, OWN_KEYS);
	const [makeFieldProps] = splitMakeFieldProps(rest);

	const minTime = createMemo(() => parseOptionalHHMM(own.minTime));
	const maxTime = createMemo(() => parseOptionalHHMM(own.maxTime));
	// Memoized by the string value, not recomputed identity — mirrors
	// DatePicker's minDate/maxDate memoization. `toControlledValue` mints a
	// fresh DateValue[] each call; without memoizing, every reactive
	// re-evaluation of this config (e.g. from an unrelated `disabled` change)
	// would hand the machine a new-but-equal array, which it reads as a
	// changed controlled value and resyncs to — silently reverting whatever
	// the user was mid-typing.
	const controlledValue = createMemo(() => toControlledValue(own.value));

	// Tracks the most recently ATTEMPTED time — including one the range guard
	// below rejected — separately from the machine's own `dateInput().value`.
	// For a controlled instance, `@ark-ui/solid`'s date-input treats `value` as
	// authoritative: its internal "value" bindable keeps returning `own.value`
	// regardless of what gets committed internally, so an out-of-range edit
	// that we deliberately decline to propagate to `own.onValueChange` would
	// otherwise never show up in `dateInput().value` either — the field would
	// look invalid only until the NEXT re-render, and never at all if the
	// consumer's `value` prop stays static. Seeded from the initial `value`
	// prop; re-synced whenever that prop changes from OUTSIDE (the effect
	// below); updated directly from every attempted edit (in the machine's
	// onValueChange, below) so a rejected out-of-range entry is still visible.
	const [attemptedTime, setAttemptedTime] = createSignal<Time | undefined>(
		parseOptionalHHMM(own.value)
	);
	createEffect(() => {
		setAttemptedTime(parseOptionalHHMM(own.value));
	});

	const dateInput = useDateInput(() => ({
		formatter: buildTimeFormatter(LOCALE, "minute"),
		granularity: "minute",
		locale: LOCALE,
		// The machine's default `allSegments` (derived from the formatter by
		// `resolveAllSegments`) unconditionally adds `era: true` on top of
		// whatever the formatter actually renders — even though a time-only
		// formatter never renders an era/year segment, so `era` can never
		// become non-null through editing. Since `isComplete`/`isCleared`
		// (which gate every commit — typing a full time, and clearing one)
		// check ALL of `allSegments`, that phantom `era` requirement means a
		// value could NEVER commit via segment interaction without this
		// override. Passing our own `allSegments` (matching exactly what the
		// formatter renders) is what makes typing/clearing actually commit.
		allSegments: { hour: true, minute: true },
		// Forward disabled so the machine drops segment tabIndex/editing —
		// MakeField/MakeDisablable only blocks pointer events, not keyboard.
		disabled: makeFieldProps.disabled,
		defaultPlaceholderValue: EPOCH_PLACEHOLDER,
		value: controlledValue(),
		onValueChange: (details) => {
			const next =
				details.value.length > 0
					? (valueToTime(details.value[0]) ?? null)
					: null;
			// Track every attempted commit — valid or not — so an out-of-range
			// entry still marks the field invalid below (see `attemptedTime`).
			setAttemptedTime(next ?? undefined);
			// Don't commit an out-of-range value: the field stays visibly
			// invalid, but the value never reaches the consumer's
			// onValueChange. Clearing to null always propagates.
			if (next && !isWithinWindow(next, minTime(), maxTime())) return;
			own.onValueChange?.(next ? formatHHMM(next) : null);
		},
	}));

	// Derive validity from the most recently attempted time. An out-of-range
	// time marks the field invalid rather than being clamped.
	const isRangeInvalid = createMemo(() => {
		const time = attemptedTime();
		return time ? !isWithinWindow(time, minTime(), maxTime()) : false;
	});
	const isInvalid = createMemo(
		() => Boolean(makeFieldProps.invalid) || isRangeInvalid()
	);
	const errorText = createMemo(() =>
		isRangeInvalid()
			? (makeFieldProps.errorText ?? DEFAULT_OUT_OF_RANGE_TEXT)
			: makeFieldProps.errorText
	);

	// Focus the first EDITABLE segment. The ":" separator also carries
	// data-part="segment" but is aria-hidden and non-focusable (no
	// data-editable) — selecting [data-editable] skips it and lands on hour.
	function focusInput(): void {
		focusFirstEditableSegment(controlElement);
	}

	return (
		<MakeField
			{...makeFieldProps}
			invalid={isInvalid()}
			errorText={errorText()}
			onLabelClicked={focusInput}
			focusField={focusInput}
		>
			<DateInput.RootProvider value={dateInput} class={styles.root}>
				<DateInput.Control
					ref={(element) => {
						controlElement = element;
					}}
					class={styles.control}
					data-invalid={isInvalid() ? "true" : undefined}
					onClick={(event) => {
						// Clicking the empty field area (or the icon) focuses
						// the first segment, like a normal text field. Clicks
						// on an editable segment keep their own behaviour.
						if (!isEditableSegment(event.target as HTMLElement)) {
							focusInput();
						}
					}}
				>
					<Icon class={styles.icon}>{ICONS.time}</Icon>
					<DateInput.SegmentGroup class={styles.segmentGroup}>
						<DateInput.Context>
							{(api) => <Segments api={api} />}
						</DateInput.Context>
					</DateInput.SegmentGroup>
				</DateInput.Control>
				<DateInput.HiddenInput />
			</DateInput.RootProvider>
		</MakeField>
	);
}
