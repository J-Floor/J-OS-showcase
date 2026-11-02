import type { Hotkey } from "@tanstack/solid-hotkeys";
import { useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import {
	PERK_REQUEST_STATUS_LABELS,
	type PerkRequestStatus,
} from "../../../../convex/lib/perks.ts";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { call } from "../../../lib/call.ts";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { ICONS } from "../../../shared/icons.ts";

/** The statuses the footer moves a request to, in the order a request
 *  moves, each with its key, its icon and why it is off while the request
 *  is already there. Requested is where a request starts, never where the
 *  board sends one. */
const STATUS_ACTIONS: readonly {
	status: Exclude<PerkRequestStatus, "requested">;
	hotkey: Hotkey;
	icon: string;
	current: string;
}[] = [
	{
		status: "contacted",
		hotkey: "C",
		icon: ICONS.email,
		current: "The requester has been contacted",
	},
	{
		status: "granted",
		hotkey: "G",
		icon: ICONS.stepDone,
		current: "The request is granted",
	},
	{
		status: "declined",
		hotkey: "X",
		icon: ICONS.decline,
		current: "The request is declined",
	},
];

/**
 * The request sheet's footer actions, for the buttons and the keys alike:
 * Contacted, Granted and Declined, each moving the request there. The
 * request's current status is offered disabled, saying so. `error` is the
 * refusal of the last move, for the footer; it belongs to the request it
 * was made for.
 */
export function createRequestActions(options: {
	requestId: () => string | undefined;
}) {
	const setStatus = useMutation(api.perkRequests.setPerkRequestStatus);
	const failure = createActionError(options.requestId);
	const actions = STATUS_ACTIONS.map(
		({
			status,
			hotkey,
			icon,
			current,
		}): ActionDescriptor<PerkRequestRow> => ({
			id: status,
			label: PERK_REQUEST_STATUS_LABELS[status],
			icon,
			hotkey,
			celebrate: status === "granted",
			can: (request) => request.status !== status,
			disabledReason: () => current,
			run: async (request) => {
				const result = await failure.trackResult(
					call(
						setStatus.mutateAsync({
							requestId: request._id,
							status,
						}),
						"Could not change the status."
					)
				);
				return { refused: result.isErr() };
			},
		})
	);
	return { actions: () => actions, error: failure.error };
}
