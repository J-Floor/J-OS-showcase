import { DatePicker, Input, TimePicker } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { createSignal } from "solid-js";

import { api } from "../../../convex/_generated/api";
import {
	SITE_TIMEZONE,
	type ZonedValue,
	composeZoned,
} from "../../../convex/lib/time.ts";
import { NAME_MAX } from "../../../convex/lib/validate.ts";
import { call } from "../../lib/call.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { InlineError } from "../../shared/InlineError.tsx";

import styles from "./EventSheet.module.scss";
import { END_TIME_LABEL, START_TIME_LABEL } from "./fields.ts";

const DEFAULT_START_TIME = "00:01";
const DEFAULT_END_TIME = "23:59";
const MISSING_FIELDS_REASON = "Add a name and both dates first";

/**
 * Composes the create form's date + time fields into Zurich-zoned instants,
 * or `null` while either date is unset.
 */
function composeRange(
	startDate: string | null,
	endDate: string | null,
	startTime: string,
	endTime: string
): { start: ZonedValue; end: ZonedValue } | null {
	if (startDate === null || endDate === null) return null;
	return {
		start: composeZoned(startDate, startTime, SITE_TIMEZONE),
		end: composeZoned(endDate, endTime, SITE_TIMEZONE),
	};
}

/**
 * The create form's state: its fields, and the mutation that submits it.
 * `onCreated` runs after the event is created.
 */
export function createEventCreateForm(options: { onCreated: () => void }) {
	const createEvent = useMutation(api.events.createEvent);
	const [name, setName] = createSignal("");
	const [startsAt, setStartsAt] = createSignal<string | null>(null);
	const [endsAt, setEndsAt] = createSignal<string | null>(null);
	const [startTime, setStartTime] = createSignal(DEFAULT_START_TIME);
	const [endTime, setEndTime] = createSignal(DEFAULT_END_TIME);
	const [submitting, setSubmitting] = createSignal(false);
	const { error, trackResult, clear } = createActionError();

	function composedRange() {
		return composeRange(startsAt(), endsAt(), startTime(), endTime());
	}

	async function submit(): Promise<void> {
		const range = composedRange();
		if (
			name().trim() === "" ||
			range === null ||
			range.start.utc > range.end.utc ||
			submitting()
		)
			return;
		setSubmitting(true);
		const result = await trackResult(
			call(
				createEvent.mutateAsync({
					name: name().trim(),
					startsAtLocal: range.start.local,
					endsAtLocal: range.end.local,
				}),
				"Could not create the event."
			)
		);
		setSubmitting(false);
		if (result.isErr()) return;
		options.onCreated();
	}

	return {
		name,
		setName,
		startsAt,
		setStartsAt,
		endsAt,
		setEndsAt,
		startTime,
		setStartTime,
		endTime,
		setEndTime,
		submitting,
		error,
		/** A fresh, empty create form. */
		reset() {
			setName("");
			setStartsAt(null);
			setEndsAt(null);
			setStartTime(DEFAULT_START_TIME);
			setEndTime(DEFAULT_END_TIME);
			clear();
		},
		canSubmit(): boolean {
			if (name().trim() === "") return false;
			const range = composedRange();
			return range !== null && range.start.utc <= range.end.utc;
		},
		/**
		 * The create button's disabled explanation. `canSubmit` returns
		 * false both when name/dates are missing AND when a fully-specified
		 * start/end is inverted (start after end) — those need distinct
		 * copy, or the missing-fields message reads as false once both
		 * dates are set.
		 */
		disabledReason(): string {
			if (name().trim() === "") return MISSING_FIELDS_REASON;
			const range = composedRange();
			if (range === null) return MISSING_FIELDS_REASON;
			return range.start.utc > range.end.utc
				? "The start must be on or before the end."
				: MISSING_FIELDS_REASON;
		},
		onSubmit: (event: SubmitEvent): void => {
			event.preventDefault();
			void submit();
		},
	};
}

export type EventCreateFormState = ReturnType<typeof createEventCreateForm>;

/** The name and start/end fields for a new event. */
export function EventCreateForm(props: { form: EventCreateFormState }) {
	return (
		<form
			id="event-create-form"
			class={styles.form}
			onSubmit={(event) => {
				props.form.onSubmit(event);
			}}
		>
			<Input
				label="Name"
				maxLength={NAME_MAX}
				required
				value={props.form.name()}
				onInput={(event) => {
					props.form.setName(event.currentTarget.value);
				}}
			/>
			<div class={styles.fieldRow}>
				<DatePicker
					label="Starts"
					value={props.form.startsAt()}
					onValueChange={props.form.setStartsAt}
				/>
				<TimePicker
					label={START_TIME_LABEL}
					value={props.form.startTime()}
					onValueChange={(value) => {
						props.form.setStartTime(value ?? DEFAULT_START_TIME);
					}}
				/>
			</div>
			<div class={styles.fieldRow}>
				<DatePicker
					label="Ends"
					value={props.form.endsAt()}
					onValueChange={props.form.setEndsAt}
				/>
				<TimePicker
					label={END_TIME_LABEL}
					value={props.form.endTime()}
					onValueChange={(value) => {
						props.form.setEndTime(value ?? DEFAULT_END_TIME);
					}}
				/>
			</div>
			<p class={styles.hint}>
				Times are Europe/Zurich (the space), wherever you're editing
				from.
			</p>
			<InlineError message={props.form.error()} />
		</form>
	);
}
