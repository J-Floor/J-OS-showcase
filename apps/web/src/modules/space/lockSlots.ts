import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { ICONS } from "../../shared/icons.ts";

/** Copy and icon every door surface (the Doors card, the "Getting in" intro)
 *  renders identically: `label` is the short status-copy form ("Upstairs"),
 *  `buttonLabel` the long form used on the door buttons and door list
 *  ("Upstairs (4th floor)"), and `icon` the design-system icon name. */
export type SlotInfo = {
	label: string;
	buttonLabel: string;
	icon: string;
};

const SLOT_INFO: Record<LockSlot, SlotInfo> = {
	downstairs: {
		label: "Downstairs",
		buttonLabel: "Downstairs",
		icon: ICONS.doorStreet,
	},
	upstairs: {
		label: "Upstairs",
		buttonLabel: "Upstairs (4th floor)",
		icon: ICONS.door,
	},
};

/** The copy and icon for one lock. Total over `LockSlot`: every slot has one. */
export function slotInfo(slot: LockSlot): SlotInfo {
	return SLOT_INFO[slot];
}

/** The two physical smart locks, in the app's fixed display order. */
export const LOCK_SLOTS: ({ slot: LockSlot } & SlotInfo)[] = (
	["downstairs", "upstairs"] as const
).map((slot) => ({ slot, ...SLOT_INFO[slot] }));
