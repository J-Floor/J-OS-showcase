import {
	Accordion,
	Avatar,
	DatePicker,
	EditableText,
	PropertyRow,
	Query,
	TimePicker,
	useSaveTracker,
} from "@j-os/design-system";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { For, Show, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import {
	SITE_TIMEZONE,
	type ZonedValue,
	composeZoned,
	formatZoned,
	zonedDate,
	zonedTime,
} from "../../../convex/lib/time.ts";
import { NAME_MAX } from "../../../convex/lib/validate.ts";
import { call } from "../../lib/call.ts";
import { reportSave } from "../../lib/reportSave.ts";
import {
	createActionError,
	scopeOfFields,
} from "../../shared/createActionError.ts";
import { EntityQrBlock } from "../../shared/entity/EntityQr.tsx";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";

import { eventsEntity } from "./entity.ts";
import styles from "./EventSheet.module.scss";
import { END_TIME_LABEL, START_TIME_LABEL, eventFields } from "./fields.ts";

/** One row of an event's attendee list. */
export type Attendee = FunctionReturnType<
	typeof api.events.listEventAttendees
>[number];

/** The fields one edit writes: any subset of what `updateEvent` takes. */
export type EventPatch = Omit<
	FunctionArgs<typeof api.events.updateEvent>,
	"eventId"
>;

/** The zoned IXDTF source for an event's start/end. Required on the schema (the
 *  prod backfill populated every row and `createEvent` always writes both), so
 *  these are plain field reads — named for the call sites that compose/display
 *  them below. */
function startLocal(event: Doc<"events">): string {
	return event.startsAtLocal;
}
function endLocal(event: Doc<"events">): string {
	return event.endsAtLocal;
}

/** What differs between an event's start and its end: where its zoned value
 *  lives, the patch that writes it, and the other end it may not cross. */
const BOUNDARIES = {
	start: {
		field: eventFields.startsAt,
		timeLabel: START_TIME_LABEL,
		local: startLocal,
		patch: (local: string): EventPatch => ({ startsAtLocal: local }),
		isAllowed: (composed: ZonedValue, event: Doc<"events">): boolean =>
			composed.utc <= event.endsAt,
	},
	end: {
		field: eventFields.endsAt,
		timeLabel: END_TIME_LABEL,
		local: endLocal,
		patch: (local: string): EventPatch => ({ endsAtLocal: local }),
		isAllowed: (composed: ZonedValue, event: Doc<"events">): boolean =>
			composed.utc >= event.startsAt,
	},
};

/** One end of an event's time range: its zoned date and time, editable while
 *  the sheet is. A change that would put the start after the end is
 *  ignored. */
function EventBoundaryRow(props: {
	boundary: keyof typeof BOUNDARIES;
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	onPatch: (patch: EventPatch) => void;
}) {
	function boundary() {
		return BOUNDARIES[props.boundary];
	}
	function local(): string {
		return boundary().local(props.event());
	}
	function commit(composed: ZonedValue) {
		if (boundary().isAllowed(composed, props.event()))
			props.onPatch(boundary().patch(composed.local));
	}
	return (
		<PropertyRow field={boundary().field}>
			<Show
				when={props.isEditing()}
				fallback={<span>{formatZoned(local())}</span>}
			>
				<div class={styles.fieldRow}>
					<DatePicker
						label={boundary().field.label}
						labelHidden
						value={zonedDate(local())}
						onValueChange={(iso) => {
							if (!iso) return;
							commit(
								composeZoned(
									iso,
									zonedTime(local()),
									SITE_TIMEZONE
								)
							);
						}}
					/>
					<TimePicker
						label={boundary().timeLabel}
						value={zonedTime(local())}
						onValueChange={(time) => {
							if (!time) return;
							commit(
								composeZoned(
									zonedDate(local()),
									time,
									SITE_TIMEZONE
								)
							);
						}}
					/>
				</div>
			</Show>
		</PropertyRow>
	);
}

/** The "Details" section: name and start/end, editable while `isEditing`.
 *  Each change saves at once and reports to the sheet's save status. */
export function EventDetailsItem(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	/** The sheet is open: a change failing once it closed toasts. */
	isOpen: Accessor<boolean>;
}) {
	const updateEvent = useMutation(api.events.updateEvent);
	const tracker = useSaveTracker();
	const { error, trackResult } = createActionError();
	function patch(change: EventPatch): void {
		const eventId = props.event()._id;
		const scope = scopeOfFields(change);
		reportSave(
			tracker?.track(scope),
			() =>
				trackResult(
					call(
						updateEvent.mutateAsync({ eventId, ...change }),
						"Could not save that change."
					),
					scope
				),
			props.isOpen
		);
	}
	return (
		<Accordion.Item value="details">
			<Accordion.ItemTitle>Details</Accordion.ItemTitle>
			<Accordion.ItemContent>
				<div class={styles.section}>
					<PropertyRow icon={ICONS.name} label="Name">
						<Show
							when={props.isEditing()}
							fallback={<span>{props.event().name}</span>}
						>
							<EditableText
								label="Name"
								value={props.event().name}
								maxLength={NAME_MAX}
								onCommit={(value) => {
									patch({ name: value });
								}}
							/>
						</Show>
					</PropertyRow>
					<EventBoundaryRow
						boundary="start"
						event={props.event}
						isEditing={props.isEditing}
						onPatch={patch}
					/>
					<EventBoundaryRow
						boundary="end"
						event={props.event}
						isEditing={props.isEditing}
						onPatch={patch}
					/>
					<InlineError message={error()} />
				</div>
			</Accordion.ItemContent>
		</Accordion.Item>
	);
}

function AttendeeList(props: { attendees: Accessor<Attendee[]> }) {
	return (
		<ul class={styles.attendees}>
			<For each={props.attendees()}>
				{(attendee) => (
					<li class={styles.attendee}>
						<Avatar name={attendee.name} />
						<div class={styles.who}>
							<span class={styles.attendeeName}>
								{attendee.name}
							</span>
							<span class={styles.attendeeEmail}>
								{attendee.email}
							</span>
						</div>
					</li>
				)}
			</For>
		</ul>
	);
}

/** The board-only sections: the visitor QR and link, and who registered. */
export function EventAdminItems(props: {
	event: Accessor<Doc<"events">>;
	attendees: Accessor<Attendee[] | undefined>;
}) {
	return (
		<>
			<Accordion.Item value="visitor">
				<Accordion.ItemTitle>QR &amp; link</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<EntityQrBlock {...eventsEntity.qr!(props.event())} />
				</Accordion.ItemContent>
			</Accordion.Item>

			<Query.Root data={props.attendees()}>
				<Accordion.Item value="attendees">
					<Accordion.ItemTitle>
						Attendees
						<Accordion.ItemSubtitle>
							<Query.Count />
						</Accordion.ItemSubtitle>
					</Accordion.ItemTitle>
					<Accordion.ItemContent>
						<div class={styles.section}>
							<Query.Empty>
								<p class={styles.empty}>
									No one has registered yet.
								</p>
							</Query.Empty>
							<Query.Content of={props.attendees()}>
								{(rows) => <AttendeeList attendees={rows} />}
							</Query.Content>
						</div>
					</Accordion.ItemContent>
				</Accordion.Item>
			</Query.Root>
		</>
	);
}
