import { Button, Segment, Sheet, TimePicker } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import {
	createEffect,
	createSignal,
	For,
	on,
	Show,
	untrack,
	type JSX,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type {
	ScheduleDay,
	ScheduleDayName,
} from "../../../../convex/lib/tv/schedule.ts";
import { call } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { EntitySheetHeader } from "../../../shared/entity/EntitySheetHeader.tsx";
import { SheetFooter } from "../../../shared/entity/SheetFooter.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";

import {
	daysFromRows,
	rowsFromSchedule,
	rowsProblem,
	type DayMode,
	type DayRow,
} from "./scheduleForm.ts";
import styles from "./ScheduleSheet.module.scss";

const SAVE_FAILED = "Could not save the schedule. Try again.";

const DAY_LABELS: Record<ScheduleDayName, string> = {
	mon: "Monday",
	tue: "Tuesday",
	wed: "Wednesday",
	thu: "Thursday",
	fri: "Friday",
	sat: "Saturday",
	sun: "Sunday",
};

type ScheduleSheetProps = SheetOpenProps & {
	device: {
		_id: Id<"tvDevices">;
		label: string;
		schedule: ScheduleDay[] | undefined;
	};
};

function isMode(value: unknown): value is DayMode {
	return value === "always" || value === "hours" || value === "closed";
}

function DayEditor(props: {
	row: DayRow;
	onChange: (change: Partial<DayRow>) => void;
}): JSX.Element {
	function name(): string {
		return DAY_LABELS[props.row.day];
	}
	return (
		<li class={styles.day}>
			<span class={styles.dayName}>{name()}</span>
			<Segment.Root
				aria-label={`${name()} screen`}
				orientation="horizontal"
				value={props.row.mode}
				onValueChange={(details) => {
					if (isMode(details.value))
						props.onChange({ mode: details.value });
				}}
			>
				<Segment.Item value="always">Always on</Segment.Item>
				<Segment.Item value="hours">Hours</Segment.Item>
				<Segment.Item value="closed">Closed</Segment.Item>
			</Segment.Root>
			<Show when={props.row.mode === "hours"}>
				<div class={styles.times}>
					<TimePicker
						label={`${name()} on`}
						value={props.row.on}
						onValueChange={(value) => {
							// A cleared field keeps the last time: a row always has both.
							if (value !== null) props.onChange({ on: value });
						}}
					/>
					<TimePicker
						label={`${name()} off`}
						value={props.row.off}
						onValueChange={(value) => {
							// A cleared field keeps the last time: a row always has both.
							if (value !== null) props.onChange({ off: value });
						}}
					/>
				</div>
			</Show>
		</li>
	);
}

function DayList(props: {
	rows: readonly DayRow[];
	onChange: (index: number, change: Partial<DayRow>) => void;
}): JSX.Element {
	return (
		<ul class={styles.days}>
			<For each={props.rows}>
				{(row, index) => (
					<DayEditor
						row={row}
						onChange={(change) => {
							props.onChange(index(), change);
						}}
					/>
				)}
			</For>
		</ul>
	);
}

/**
 * One TV's weekly screen schedule: for each weekday the screen is always on,
 * on between two times, or closed. The draft is local and saved with a
 * button; it starts again from the saved schedule each time the sheet opens.
 */
export function ScheduleSheet(props: ScheduleSheetProps): JSX.Element {
	const setSchedule = useMutation(api.tv.setDeviceSchedule);
	const { error, trackResult, clear } = createActionError(
		() => props.device._id
	);
	const [rows, setRows] = createStore<DayRow[]>(
		rowsFromSchedule(untrack(() => props.device.schedule))
	);
	const [isSaving, setIsSaving] = createSignal(false);
	createEffect(
		on(
			() => props.open,
			(isOpen) => {
				if (!isOpen) return;
				// A refusal from an earlier opening must not greet this one.
				clear();
				setRows(
					reconcile(
						rowsFromSchedule(untrack(() => props.device.schedule))
					)
				);
			},
			{ defer: true }
		)
	);
	function problem(): string | undefined {
		return rowsProblem(rows);
	}

	async function save(): Promise<void> {
		setIsSaving(true);
		const result = await trackResult(
			call(
				setSchedule.mutateAsync({
					id: props.device._id,
					days: daysFromRows(rows),
				}),
				SAVE_FAILED
			)
		);
		setIsSaving(false);
		if (result.isOk()) props.onOpenChange(false);
	}

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
		>
			<EntitySheetHeader title={`Schedule for ${props.device.label}`} />
			<Sheet.Body>
				<DayList
					rows={rows}
					onChange={(index, change) => {
						setRows(index, change);
					}}
				/>
				<p class={styles.hint}>
					Hours run within one day: the screen turns on before it
					turns off, so it cannot stay on past midnight.
				</p>
			</Sheet.Body>
			<SheetFooter error={error() ?? problem()}>
				<Button
					variant="secondary"
					onClick={() => {
						props.onOpenChange(false);
					}}
				>
					Cancel
				</Button>
				<Button
					onClick={() => save()}
					disabled={problem() !== undefined || isSaving()}
					disabledReason={problem() ?? "Saving the schedule"}
				>
					{isSaving() ? "Saving..." : "Save"}
				</Button>
			</SheetFooter>
		</Sheet.Root>
	);
}
