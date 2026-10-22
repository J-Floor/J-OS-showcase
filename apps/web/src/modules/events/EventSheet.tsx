import {
	Accordion,
	Button,
	Sheet,
	Icon,
	PropertyRow,
} from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, createEffect, createSignal, on, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Can, useAbility } from "../../lib/ability.tsx";
import { call } from "../../lib/call.ts";
import { useConfirm } from "../../shared/confirm.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { EditToggle } from "../community/sheets/EditToggle.tsx";

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
import styles from "./EventSheet.module.scss";
import { eventAttendeesQuery } from "./queries.ts";

/**
 * Placeholder field layout passed to `Sheet.Body`'s `skeleton` while
 * `loading` is true — an open row whose data hasn't arrived yet. Shaped like
 * the loaded accordion (labelled rows under a "Details" section) so the
 * measured shimmer has leaves matching that shape; literal "placeholder"
 * text, never real or create-form copy.
 */
function EventFieldsPlaceholder() {
	return (
		<Accordion.Root multiple defaultValue={["details"]}>
			<Accordion.Item value="details">
				<Accordion.ItemTitle>Details</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<div class={styles.section}>
						<PropertyRow icon={ICONS.name} label="Name">
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow icon={ICONS.start} label="Starts">
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow icon={ICONS.end} label="Ends">
							<span>placeholder</span>
						</PropertyRow>
					</div>
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion.Root>
	);
}

const ALL_SECTIONS = ["details", "visitor", "attendees"];

/** The title, the edit toggle (an existing event, board/admin) and the
 *  close button. */
function EventSheetHeader(props: {
	event?: Doc<"events">;
	loading?: boolean;
	isOpen: boolean;
	canManage: boolean;
	isEditing: boolean;
	onToggleEditing: () => void;
}) {
	return (
		<Sheet.Header>
			<Sheet.Title loading={props.loading}>
				{props.event ? props.event.name : "New event"}
			</Sheet.Title>
			<Sheet.HeaderActions>
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
				<Sheet.Close />
			</Sheet.HeaderActions>
		</Sheet.Header>
	);
}

/** An existing event's accordion: its details for anyone, the QR and
 *  attendees for the board. */
function EventDetailAccordion(props: {
	event: Accessor<Doc<"events">>;
	isEditing: Accessor<boolean>;
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
			<EventDetailsItem event={props.event} isEditing={props.isEditing} />
			<Show when={props.canManage}>
				<EventAdminItems
					event={props.event}
					attendees={props.attendees}
				/>
			</Show>
		</Accordion.Root>
	);
}

/** The sheet's footer: Delete on an existing event (board/admin), Create
 *  on the create form. Nothing while the row is still loading. */
function EventSheetFooter(props: {
	event?: Doc<"events">;
	loading?: boolean;
	canManage: boolean;
	form: EventCreateFormState;
	onClose: () => void;
}) {
	const deleteEvent = useMutation(api.events.deleteEvent);
	const confirm = useConfirm();

	const { error, trackResult } = createActionError();

	async function remove(event: Doc<"events">): Promise<void> {
		const isOk = await confirm({
			title: "Delete event?",
			message: "This removes the event and its attendance records.",
			confirmLabel: "Delete",
			tone: "danger",
		});
		if (!isOk) return;
		const result = await trackResult(
			call(
				deleteEvent.mutateAsync({ eventId: event._id }),
				"Could not delete the event."
			)
		);
		if (result.isErr()) return;
		props.onClose();
	}

	return (
		<Show when={!props.loading}>
			<Show
				when={props.event === undefined}
				fallback={
					<Show when={props.canManage && props.event} keyed>
						{(event) => (
							<Sheet.Footer>
								<InlineError message={error()} />
								<Button
									variant="tertiary"
									onClick={() => remove(event)}
								>
									<Icon>{ICONS.delete}</Icon> Delete event
								</Button>
							</Sheet.Footer>
						)}
					</Show>
				}
			>
				<Can I="create" the="Events">
					<Sheet.Footer>
						<Button
							type="submit"
							form="event-create-form"
							disabled={!props.form.canSubmit()}
							disabledReason={props.form.disabledReason()}
							isLoading={props.form.submitting()}
						>
							Create
						</Button>
					</Sheet.Footer>
				</Can>
			</Show>
		</Show>
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
export function EventSheet(props: {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
	event?: Doc<"events">;
	/** True when the sheet is open for a real row (`requestedId()` set) whose
	 *  data hasn't loaded yet — distinct from create, where there is no id at
	 *  all. Wins over `event` (which is undefined in both states). */
	loading?: boolean;
}) {
	const ability = useAbility();
	function canManage(): boolean {
		return ability().can("manage", "Events");
	}

	const form = createEventCreateForm({
		onCreated: () => {
			props.onOpenChange(false);
		},
	});

	const attendees = useEventAttendees(() => props.event, canManage);

	const [editing, setEditing] = createSignal(false);
	// Controlled + onValueChange so the sections actually collapse (matches
	// community's PersonDetail). A bare `value` with no setter pins them open.
	const [openSections, setOpenSections] = createSignal(ALL_SECTIONS);

	// Fresh create form + locked fields on a sheet OPEN or a switch to a
	// different event — keyed on `open` + the event id, NOT the event object, so
	// a live-query refetch after an autosaved edit doesn't re-lock the fields
	// mid-edit.
	createEffect(
		on(
			() => [props.open, props.event?._id] as const,
			([isOpen]) => {
				if (!isOpen) return;
				setEditing(false);
				if (props.event === undefined) form.reset();
			}
		)
	);

	return (
		<Sheet.Root
			open={props.open}
			onOpenChange={props.onOpenChange}
			morph={props.event?._id}
		>
			<EventSheetHeader
				event={props.event}
				loading={props.loading}
				isOpen={props.open}
				canManage={canManage()}
				isEditing={editing()}
				onToggleEditing={() => setEditing((current) => !current)}
			/>

			<Sheet.Body
				loading={props.loading}
				skeleton={<EventFieldsPlaceholder />}
			>
				<Show
					when={props.event}
					fallback={
						<Can I="create" the="Events">
							<EventCreateForm form={form} />
						</Can>
					}
				>
					{(event) => (
						<EventDetailAccordion
							event={event}
							isEditing={editing}
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
				form={form}
				onClose={() => {
					props.onOpenChange(false);
				}}
			/>
		</Sheet.Root>
	);
}
