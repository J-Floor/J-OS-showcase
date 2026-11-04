import type { Hotkey } from "@tanstack/solid-hotkeys";

import { type LockSlot } from "../../../convex/lib/doorLocks.ts";
import { type DoorAction } from "../../../convex/lib/doorProvider.ts";
import { createActionKeys } from "../../shared/actions/createActionKeys.ts";
import type { ActionDescriptor } from "../../shared/actions/shortcuts.ts";
import { slotInfo } from "../../shared/doors/lockSlots.ts";
import { ICONS } from "../../shared/icons.ts";

import { ACTION_COPY } from "./doorCopy.ts";
import { type SlotView } from "./doorView.ts";

/** The Doors card's keys. */
const DOORS_SCOPE = "space-doors";

/** What a door key acts on: the card. Which door, and which action, is the
 *  descriptor's own (one per door and action), not a target. */
export const DOORS_TARGET = "doors";
export type DoorsTarget = typeof DOORS_TARGET;

/** One key per door and action, shown on that door's button: the letter
 *  unlocks, Shift and the letter locks. */
const DOOR_HOTKEYS: Record<LockSlot, Record<DoorAction, Hotkey>> = {
	upstairs: { unlock: "U", lock: "Shift+U" },
	downstairs: { unlock: "D", lock: "Shift+D" },
};

/** Every door's descriptors, by door and then action. */
type DoorKeyActions = Record<
	LockSlot,
	Record<DoorAction, ActionDescriptor<DoorsTarget>>
>;

/**
 * The Doors card's keys: each door's Unlock and Lock, and Check again (`R`),
 * busy while a check the card started on its own is under way
 * (`isChecking`).
 *
 * A door key is live only while that door's slot is showing the very button
 * it names (`view`, the one the slot renders from): a door held on a status
 * line, still loading, or showing the other action does nothing, so a key
 * never reaches a door that is not visibly targeted. A press goes through the
 * same `press` a tap does, so the presence check and every refusal path are
 * the tap's own.
 */
export function createDoorKeys(options: {
	view: (slot: LockSlot) => SlotView;
	press: (slot: LockSlot, action: DoorAction) => void;
	canRefresh: () => boolean;
	refresh: () => void;
	isChecking: () => boolean;
	active: () => boolean;
}) {
	function door(
		slot: LockSlot,
		action: DoorAction
	): ActionDescriptor<DoorsTarget> {
		const { label, icon } = ACTION_COPY[action];
		return {
			id: `${action}-${slot}`,
			label: `${label} ${slotInfo(slot).buttonLabel}`,
			icon,
			hotkey: DOOR_HOTKEYS[slot][action],
			can: () => {
				const view = options.view(slot);
				return (
					(view.kind === "button" && view.action === action) ||
					// Both actions show side by side while the bolt's position
					// is unknown.
					view.kind === "both"
				);
			},
			run: () => {
				options.press(slot, action);
			},
		};
	}

	function forSlot(slot: LockSlot): DoorKeyActions[LockSlot] {
		return { unlock: door(slot, "unlock"), lock: door(slot, "lock") };
	}
	const doors: DoorKeyActions = {
		upstairs: forSlot("upstairs"),
		downstairs: forSlot("downstairs"),
	};

	const checkAgain: ActionDescriptor<DoorsTarget> = {
		id: "check-doors",
		label: "Check again",
		icon: ICONS.refresh,
		hotkey: "R",
		can: options.canRefresh,
		disabledReason: () => "A door action is in progress…",
		isBusy: options.isChecking,
		run: () => {
			options.refresh();
		},
	};

	createActionKeys<DoorsTarget>({
		scope: DOORS_SCOPE,
		actions: () => [
			checkAgain,
			...Object.values(doors.upstairs),
			...Object.values(doors.downstairs),
		],
		target: () => DOORS_TARGET,
		active: options.active,
	});

	return { doors, checkAgain };
}
