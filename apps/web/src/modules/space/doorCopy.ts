import { type DoorAction } from "../../../convex/lib/doorProvider.ts";
import { ICONS } from "../../shared/icons.ts";
import { MS_PER_SECOND } from "../../shared/time.ts";

export const SENDING_TEXT = "Sending…";
export const WAKING_TEXT = "Waking the door…";
/** The copy and icon of each action, so nothing else branches on which. */
export const ACTION_COPY: Record<
	DoorAction,
	{
		label: string;
		icon: string;
		progress: string;
		verb: string;
		sent: string;
		errorFallback: string;
	}
> = {
	unlock: {
		label: "Unlock",
		icon: ICONS.unlock,
		progress: "Door is unlocking",
		verb: "opening",
		sent: "Sent — the door should open shortly.",
		errorFallback: "Couldn't open the door.",
	},
	lock: {
		label: "Lock",
		icon: ICONS.lock,
		progress: "Door is locking",
		verb: "locking",
		sent: "Sent — the door should lock shortly.",
		errorFallback: "Couldn't lock the door.",
	},
};
export const DOOR_ACTIONS = [
	"unlock",
	"lock",
] as const satisfies readonly DoorAction[];

export function offsiteText(action: DoorAction): string {
	return `Join the J floor Wi-Fi to ${action} — the Wi-Fi card has the details.`;
}

export function openText(remainingMs: number): string {
	return `Open — push now (${Math.max(1, Math.ceil(remainingMs / MS_PER_SECOND))}s)`;
}

export function noResponseText(label: string): string {
	return `${label} door didn't respond — try again.`;
}

export function offlineText(label: string): string {
	return `${label} lock is offline — try again in a moment.`;
}

/** Copy for the statuses the unlock and lock actions return besides "ok". */
export function resultText(
	status: "offline" | "busy" | "debounced",
	label: string,
	action: DoorAction
): string {
	const { verb } = ACTION_COPY[action];
	switch (status) {
		case "debounced":
			return `${label} door is already ${verb}.`;
		case "offline":
			return offlineText(label);
		case "busy":
			return `${label} door is still ${verb} — wait a few seconds before trying again.`;
	}
}
