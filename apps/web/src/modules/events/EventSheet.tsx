import { Accordion, Sheet, PropertyRow } from "@j-os/design-system";
import { Show, createEffect, createSignal, on, type Accessor } from "solid-js";

import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Can, useCan } from "../../lib/ability.tsx";
import { EditToggle } from "../../shared/components/EditToggle.tsx";
import { useQuery } from "../../shared/data/useQuery.ts";
import { createDraftGuard } from "../../shared/entity/createDraftGuard.ts";
import { EntitySheetHeader } from "../../shared/entity/EntitySheetHeader.tsx";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";
import { ICONS } from "../../shared/icons.ts";
import type { SheetOpenProps } from "../../shared/types.ts";

import { createEventSheetActions } from "./eventActions.ts";
import {
	EventCreateForm,
	createEventCreateForm,
	type EventCreateFormState,
} from "./EventCreateForm.tsx";
import {
	EventAdminItems,
	EventDetailsItem,
	type Attendee,
} from "./EventDetails.tsx";
import { EventSheetFooter } from "./EventSheetFooter.tsx";
import { eventAttendeesQuery } from "./queries.ts";

/**
 * Placeholder field layout shown by `Sheet.Skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded accordion (labelled rows under a "Details" section) so the
 * measured shimmer has leaves matching that shape; literal "placeholder"
 * text, never real or create-form copy.
 */
function EventFieldsPlaceholder() {
	return (
		<Accordion.Root multiple defaultValue={["details"]}>
			<SheetSection value="details" title="Details">
				<PropertyRow icon={ICONS.name} label="Name">
					<span>placeholder</span>
				</PropertyRow>
				<PropertyRow icon={ICONS.start} label="Starts">
					<span>placeholder</span>
				</PropertyRow>
				<PropertyRow icon={ICONS.end} label="Ends">
					<span>placeholder</span>
				</PropertyRow>
			</SheetSection>
		</Accordion.Root>
	);
}

const ALL_SECTIONS = ["details", "visitor", "attendees"];

/** What the sheet is open for: an existing event, a row still loading, or
 *  (neither) a new event. */
type EventSheetProps = SheetOpenProps & {
	event?: Doc<"events">;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `event` (which is undefined in both states). */
	loading?: boolean;
};

/** `EntitySheetHeader` plus the edit toggle, which it shows only for an
 *  existing, loaded event and only to the board/admin (`canManage`). */
function EventSheetHeader(
	props: Pick<EventSheetProps, "event" | "loading"> & {
		isOpen: boolean;
		canManage: boolean;
		isEditing: boolean;
		onToggleEditing: () => void;
	}
) {
	return (
		<EntitySheetHeader
			title={props.event ? props.event.name : "New event"}
			loading={props.loading}
			saveStatus={!props.loading && props.event !== undefined}
		>
			<Show
				when={
					!props.loading &&
					props.event !== undefined &&
					props.canManage
				}
			>
				<EditToggle
					editing={props.isEditing}
					enabled={props.isOpen}
					onToggle={props.onToggleEditing}
				/>
			</Show>
		</EntitySheetHeader>
	);
}

/** An existing event's accordion: its details for anyone, the QR and
 *  attendees for the board. */
function EventDetailAccordion(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
	isOpen: Accessor<boolean>;
	canManage: boolean;
	attendees: Accessor<Attendee[] | undefined>;
	openSections: string[];
	onOpenSectionsChange: (sections: string[]) => void;
}) {
	return (
		<Accordion.Root
			multiple
			value={props.openSections}
			onValueChange={(details) => {
				props.onOpenSectionsChange(details.value);
			}}
		>
			<EventDetailsItem
				event={props.event}
				isEditing={props.isEditing}
				isOpen={props.isOpen}
			/>
			<Show when={props.canManage}>
				<EventAdminItems
					event={props.event}
					attendees={props.attendees}
				/>
			</Show>
		</Accordion.Root>
	);
}

/** Who registered for the open event: the board's list, so the query runs
 *  only for an existing event and a viewer who can manage events. Never
 *  shows the previous event's list while the next one loads. */
function useEventAttendees(
	event: () => Doc<"events"> | undefined,
	canManage: () => boolean
) {
	return useQuery(
		eventAttendeesQuery.query,
		() => eventAttendeesQuery.args(event()?._id as Id<"events">),
		() => ({
			enabled: event() !== undefined && canManage(),
			keepPreviousData: false,
		})
	);
}

/** The create form's draft guard: asks before a typed draft is thrown
 *  away. */
function createEventDraft(props: EventSheetProps, form: EventCreateFormState) {
	return createDraftGuard({
		isOpen: () => props.open && !props.loading && props.event === undefined,
		values: () => ({
			name: form.name(),
			startsAt: form.startsAt(),
			endsAt: form.endsAt(),
			startTime: form.startTime(),
			endTime: form.endTime(),
		}),
		onOpenChange: (isOpen) => {
			props.onOpenChange(isOpen);
		},
	});
}

/** Fresh create form + locked fields on a sheet OPEN or a switch to a
 *  different event — keyed on `open` + the event id, NOT the event object, so
 *  a live-query refetch after an autosaved edit doesn't re-lock the fields
 *  mid-edit. */
function resetOnOpen(
	props: EventSheetProps,
	form: EventCreateFormState,
	lockFields: () => void
) {
	createEffect(
		on(
			() => [props.open, props.event?._id] as const,
			([isOpen]) => {
				if (!isOpen) return;
				lockFields();
				if (props.event === undefined) form.reset();
			}
		)
	);
}

/**
 * One sheet for creating and viewing/editing an event, styled like the
 * community person sheet: an accordion of `PropertyRow`s, a padlock
 * `EditToggle` in the header (fields autosave — no Save button), and the
 * board-only visitor QR + attendee list.
 *
 * Create mode (`event === undefined && !loading`) is reached only from the
 * page's `create`-gated button. Loading mode (`loading`, `event` still
 * undefined) shows the `Sheet.Title`/`Sheet.Body` skeleton
 * ({@link EventFieldsPlaceholder}) instead — the sheet is open for a real
 * row whose data hasn't arrived yet, and must not be mistaken for create.
 * Detail mode shows name + dates to any member; the visitor
 * QR/copy/download, the attendee list, editing and delete are all
 * `manage`/`Events` (board/admin) only.
 */
export function EventSheet(props: EventSheetProps) {
	const can = useCan();
	function canManage(): boolean {
		return can.I("manage").the("Events");
	}

	const form = createEventCreateForm({
		onCreated: () => {
			draft.onOpenChange(false);
		},
	});

	const attendees = useEventAttendees(() => props.event, canManage);

	const [editing, setEditing] = createSignal(false);
	// Controlled + onValueChange so the sections actually collapse (matches
	// community's PersonDetail). A bare `value` with no setter pins them open.
	const [openSections, setOpenSections] = createSignal(ALL_SECTIONS);

	resetOnOpen(props, form, () => {
		setEditing(false);
	});
	// After the reset above, so the reset form is the draft's baseline.
	const draft = createEventDraft(props, form);

	const actions = createEventSheetActions(props, form);

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={draft.onOpenChange}
			confirmClose={draft.confirmClose}
			discardRef={draft.discardRef}
			discardLabel="new event"
			morphId={props.event?._id}
		>
			<actions.Keys />
			<EventSheetHeader
				event={props.event}
				loading={props.loading}
				isOpen={props.open}
				canManage={canManage()}
				isEditing={editing()}
				onToggleEditing={() => setEditing((current) => !current)}
			/>

			<Sheet.Skeleton>
				<EventFieldsPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
				<Show
					when={props.event}
					fallback={
						<Can I="create" the="Events">
							<EventCreateForm
								form={form}
								create={actions.create}
							/>
						</Can>
					}
				>
					{(event) => (
						<EventDetailAccordion
							event={event}
							isEditing={editing}
							isOpen={() => props.open}
							canManage={canManage()}
							attendees={() => attendees.data()}
							openSections={openSections()}
							onOpenSectionsChange={setOpenSections}
						/>
					)}
				</Show>
			</Sheet.Body>

			<EventSheetFooter
				event={props.event}
				loading={props.loading}
				canManage={canManage()}
				actions={actions}
			/>
		</Sheet.Root>
	);
}
