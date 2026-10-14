import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import {
	type DoorAction,
	type DoorPosition,
} from "../../../convex/lib/doorProvider.ts";

import { ACTION_COPY, offlineText } from "./doorCopy.ts";
import { slotInfo } from "./lockSlots.ts";

/** What replaces a door's button: the line of text and how it is coloured. */
export type DoorStatus = {
	tone: "muted" | "warning" | "error";
	text: string;
};

/** What a door's slot shows: a line of text (an action's status, or the
 *  bolt's own state), one button, or both actions side by side when the
 *  bolt's position is unknown. */
export type SlotView =
	| { kind: "pending" }
	| { kind: "text"; status: DoorStatus }
	| { kind: "button"; action: DoorAction }
	| { kind: "both" };

/** What a door that can lock shows for its bolt's last reading. */
export function viewForReading(
	slot: LockSlot,
	reading: DoorPosition | undefined
): SlotView {
	switch (reading) {
		case undefined:
			return { kind: "pending" };
		case "locked":
			return { kind: "button", action: "unlock" };
		case "unlocked":
			return { kind: "button", action: "lock" };
		case "unlocking":
		case "locking": {
			const action = reading === "unlocking" ? "unlock" : "lock";
			return {
				kind: "text",
				status: {
					tone: "muted",
					text: ACTION_COPY[action].progress,
				},
			};
		}
		case "offline":
			return {
				kind: "text",
				status: {
					tone: "warning",
					text: offlineText(slotInfo(slot).label),
				},
			};
		case "unknown":
			return { kind: "both" };
	}
}
