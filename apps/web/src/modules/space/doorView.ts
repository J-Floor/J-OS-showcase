import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { type DoorAction } from "../../../convex/lib/doorProvider.ts";
import { slotInfo } from "../../shared/doors/lockSlots.ts";

import { ACTION_COPY, NOT_CONFIGURED_TEXT, offlineText } from "./doorCopy.ts";
import type { DoorReading } from "./doorPositions.ts";

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
	reading: DoorReading | undefined
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
		case "no-provider":
			return {
				kind: "text",
				status: { tone: "warning", text: NOT_CONFIGURED_TEXT },
			};
		case "unknown":
			return { kind: "both" };
	}
}
