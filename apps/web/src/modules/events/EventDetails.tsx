import {
	DatePicker,
	EditableText,
	EmptyState,
	PropertyRow,
	Query,
	TimePicker,
} from "@j-os/design-system";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { For, Show, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
	SITE_TIMEZONE,
	type ZonedValue,
	composeZoned,
	formatZoned,
	zonedDate,
	zonedTime,
} from "../../../convex/lib/time.ts";
import {
	DESCRIPTION_MAX,
	EVENT_LINK_MAX,
	NAME_MAX,
} from "../../../convex/lib/validate.ts";
import { PersonListItem } from "../../shared/components/PersonListItem.tsx";
import { createEntityPatch } from "../../shared/entity/createEntityPatch.ts";
import { warmPeek } from "../../shared/entity/lazyPeek.tsx";
import { useOpenPeek } from "../../shared/entity/openEntity.ts";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { personEntity } from "../community/entity.ts";

import { EventPicture } from "./EventPicture.tsx";
import styles from "./EventSheet.module.scss";
import { EventTvSection } from "./EventTvSection.tsx";
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

/** An event's description: the copy shown with it, editable while the sheet is. */
function EventDescriptionRow(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	onPatch: (patch: EventPatch) => void;
}) {
	return (
		<PropertyRow
			label={eventFields.description.label}
			icon={eventFields.description.icon}
		>
			<Show
				when={props.isEditing()}
				fallback={<span>{props.event().description ?? ""}</span>}
			>
				<EditableText
					label={eventFields.description.label}
					multiline
					value={props.event().description ?? ""}
					maxLength={DESCRIPTION_MAX}
					onCommit={(value) => {
						props.onPatch({ description: value });
					}}
				/>
			</Show>
		</PropertyRow>
	);
}

/** Where people register (a Luma-style page); the TV slide's QR opens it. Board only: the row is absent for everyone else. */
function EventLinkRow(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	onPatch: (patch: EventPatch) => void;
}) {
	return (
		<PropertyRow
			label={eventFields.link.label}
			icon={eventFields.link.icon}
		>
			<Show
				when={props.isEditing()}
				fallback={<span>{props.event().link ?? ""}</span>}
			>
				<EditableText
					label={eventFields.link.label}
					value={props.event().link ?? ""}
					maxLength={EVENT_LINK_MAX}
					onCommit={(value) => {
						props.onPatch({ link: value });
					}}
				/>
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
	/** Board only: the TV section is theirs to see and change. */
	canManage: boolean;
}) {
	const updateEvent = useMutation(api.events.updateEvent);
	function write(eventId: Id<"events">, change: EventPatch) {
		return updateEvent.mutateAsync({ eventId, ...change });
	}
	const entityPatch = createEntityPatch<EventPatch, Id<"events">>({
		key: () => props.event()._id,
		write,
		isOpen: () => props.isOpen(),
	});
	const { patch, error } = entityPatch;
	return (
		<>
			<SheetSection value="details" title="Details">
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
				<EventDescriptionRow
					event={props.event}
					isEditing={props.isEditing}
					onPatch={patch}
				/>
				<Show when={props.canManage}>
					<EventLinkRow
						event={props.event}
						isEditing={props.isEditing}
						onPatch={patch}
					/>
				</Show>
				<EventPicture
					event={props.event}
					isEditing={props.isEditing}
					onPatch={patch}
				/>
				<InlineError message={error()} />
			</SheetSection>
			<Show when={props.canManage}>
				<EventTvSection
					event={props.event}
					isEditing={props.isEditing}
					onPatch={patch}
				/>
			</Show>
		</>
	);
}

/** Who registered. Each attendee opens their person's peek over the event,
 *  morphing out of their row. */
function AttendeeList(props: { attendees: Accessor<Attendee[]> }) {
	const openPeek = useOpenPeek();
	return (
		<ul class={styles.attendees}>
			<For each={props.attendees()}>
				{(attendee) => (
					<li>
						<PersonListItem
							name={attendee.name}
							detail={attendee.email}
							open={() => {
								openPeek(personEntity, attendee.personId);
							}}
							warm={() => {
								warmPeek(personEntity);
							}}
							morphOf={attendee.personId}
						/>
					</li>
				)}
			</For>
		</ul>
	);
}

/** The board-only sections: who registered. */
export function EventAdminItems(props: {
	event: Accessor<Doc<"events">>;
	attendees: Accessor<Attendee[] | undefined>;
}) {
	return (
		<>
			<Query.Root data={props.attendees()}>
				<SheetSection
					value="attendees"
					title="Attendees"
					subtitle={<Query.Count />}
				>
					<Query.Empty>
						<EmptyState title="No one has registered yet" />
					</Query.Empty>
					<Query.Content of={props.attendees()}>
						{(rows) => <AttendeeList attendees={rows} />}
					</Query.Content>
				</SheetSection>
			</Query.Root>
		</>
	);
}
