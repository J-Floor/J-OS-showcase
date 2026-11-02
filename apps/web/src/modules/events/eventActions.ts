import { useMutation } from "convex-solidjs";

import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useAbility } from "../../lib/ability.tsx";
import { call } from "../../lib/call.ts";
import {
	bindPageKeys,
	createSheetActions,
	newAction,
} from "../../shared/actions/sheetActions.tsx";
import type {
	ActionDescriptor,
	PageTarget,
} from "../../shared/actions/shortcuts.ts";
import type { ConfirmOptions } from "../../shared/confirm.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { createEntityRemove } from "../../shared/entity/entityCommands.ts";
import type { OpenProps } from "../../shared/types.ts";

import type { EventCreateFormState } from "./EventCreateForm.tsx";

/** The page's keys: "New event". */
const PAGE_SCOPE = "events";
/** The sheet's keys: Delete on an event, Create on the form. */
const SHEET_SCOPE = "event-sheet";

const DELETE_EVENT_CONFIRM: ConfirmOptions = {
	title: "Delete event?",
	message: "This removes the event and its attendance records.",
	confirmLabel: "Delete",
	tone: "danger",
};

/**
 * The page's "New event" (`N`), live while no sheet is open. Offered to
 * whoever can create events, as the button was.
 */
export function createEventsPageActions(options: {
	openCreate: () => void;
	isSheetOpen: () => boolean;
}): ActionDescriptor<PageTarget> {
	const ability = useAbility();
	const newEvent = newAction({
		noun: "event",
		can: () => ability().can("create", "Events"),
		open: options.openCreate,
	});
	bindPageKeys(PAGE_SCOPE, [newEvent], () => !options.isSheetOpen());
	return newEvent;
}

/**
 * The event sheet's actions and keys (`createSheetActions`). Delete
 * (`Delete`, the board's) asks first, shows a refusal against the event it
 * was made for, and closes the sheet once the event is gone. Create
 * (`Mod+Enter`) submits the create form.
 */
export function createEventSheetActions(
	sheet: OpenProps & { event?: Doc<"events">; loading?: boolean },
	form: EventCreateFormState
) {
	const ability = useAbility();
	const deleteEvent = useMutation(api.events.deleteEvent);
	const failure = createActionError(() => sheet.event?._id);
	const removeEvent = createEntityRemove({
		remove: (eventId: Id<"events">) =>
			call(
				deleteEvent.mutateAsync({ eventId }),
				"Could not delete the event."
			),
		failure,
		onClose: () => {
			sheet.onOpenChange(false);
		},
	});
	const actions = createSheetActions<Doc<"events">>({
		scope: SHEET_SCOPE,
		noun: "event",
		confirm: DELETE_EVENT_CONFIRM,
		isOpen: () => sheet.open,
		isLoading: () => sheet.loading,
		row: () => sheet.event,
		remove: removeEvent,
		error: failure.error,
		canRemove: () => ability().can("manage", "Events"),
		create: {
			can: () => ability().can("create", "Events") && form.canSubmit(),
			disabledReason: () => form.disabledReason(),
			run: () => form.submit(),
			error: form.error,
		},
	});
	return { ...actions, deleteError: failure.error };
}

export type EventSheetActions = ReturnType<typeof createEventSheetActions>;
