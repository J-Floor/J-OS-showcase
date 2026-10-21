import { useAction } from "convex-solidjs";
import { createEffect, on } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DoorAttemptView } from "../../../convex/doorLog.ts";
import {
	LOCK_CAPABILITIES,
	canLock,
	type LockSlot,
} from "../../../convex/lib/doorLocks.ts";
import { type DoorAction } from "../../../convex/lib/doorProvider.ts";
import { call } from "../../lib/call.ts";

import { createDoorAttempt, type DoorAttemptWatch } from "./doorAttempt.ts";
import {
	ACTION_COPY,
	SENDING_TEXT,
	WAKING_TEXT,
	noResponseText,
	offsiteText,
	openText,
	resultText,
} from "./doorCopy.ts";
import { type createDoorPositions } from "./doorPositions.ts";
import { type DoorStatusHolds } from "./doorStatusHolds.ts";
import { LOCK_SLOTS, slotInfo } from "./lockSlots.ts";
import { fetchPresenceToken } from "./presence.ts";

const STATUS_HOLD_MS = 5000;

function holdWarning(holds: DoorStatusHolds, slot: LockSlot, text: string) {
	holds.hold(slot, { tone: "warning", text }, STATUS_HOLD_MS);
}

function holdError(holds: DoorStatusHolds, slot: LockSlot, text: string) {
	holds.hold(slot, { tone: "error", text }, STATUS_HOLD_MS);
}

/** The provider took the command, but there is no attempt to follow: the
 *  door still acts, so this is not a failure to retry. */
function holdSentUnfollowed(
	holds: DoorStatusHolds,
	slot: LockSlot,
	action: DoorAction
) {
	holds.hold(
		slot,
		{ tone: "muted", text: ACTION_COPY[action].sent },
		STATUS_HOLD_MS
	);
}

/** Holds the refusal's status when the server did not accept the action. */
function holdRefusal(
	holds: DoorStatusHolds,
	slot: LockSlot,
	action: DoorAction,
	status: "offline" | "busy" | "debounced"
) {
	holds.hold(
		slot,
		{
			tone: status === "debounced" ? "muted" : "warning",
			text: resultText(status, slotInfo(slot).label, action),
		},
		STATUS_HOLD_MS
	);
}

/**
 * Each door's attempt subscription, and the action each door is waiting to
 * hear back about: set from the server accepting it until its attempt says
 * how the door reacted.
 */
function createDoorAttempts(holds: DoorStatusHolds) {
	const attempts: Record<LockSlot, DoorAttemptWatch> = {
		downstairs: createDoorAttempt(),
		upstairs: createDoorAttempt(),
	};
	const awaiting = new Map<LockSlot, DoorAction>();
	for (const { slot } of LOCK_SLOTS)
		createEffect(
			on(attempts[slot].result, (view) => {
				settle(slot, view);
			})
		);

	/** Ends the wait on `slot`'s attempt once the server knows how it went:
	 *  the door reacted (hold for `durationMs`, counted from now), it never
	 *  did, or there is no attempt to follow. While the attempt loads or is
	 *  still `accepted`, the slot keeps waiting. */
	function settle(slot: LockSlot, view: DoorAttemptView | null | undefined) {
		const action = awaiting.get(slot);
		if (
			action === undefined ||
			view === undefined ||
			(view !== null && view.actuation === "accepted")
		)
			return;
		awaiting.delete(slot);
		attempts[slot].stop();
		if (view === null) {
			holdSentUnfollowed(holds, slot, action);
			return;
		}
		if (view.actuation === "unconfirmed") {
			holdWarning(holds, slot, noResponseText(slotInfo(slot).label));
			return;
		}
		const isMomentary =
			action === "unlock" && LOCK_CAPABILITIES[slot].momentary;
		holds.hold(
			slot,
			{
				tone: "muted",
				text: isMomentary
					? openText(view.durationMs)
					: ACTION_COPY[action].progress,
			},
			view.durationMs,
			isMomentary ? openText : undefined
		);
	}

	return {
		/** Stops following `slot`'s attempt. */
		cancel(slot: LockSlot) {
			awaiting.delete(slot);
			attempts[slot].stop();
		},
		/** Follows the attempt the server accepted for `action` on `slot`. */
		follow(slot: LockSlot, action: DoorAction, attemptId: Id<"doorLog">) {
			awaiting.set(slot, action);
			attempts[slot].watch(attemptId);
		},
	};
}

/**
 * Sends a door's unlock or lock and follows it to the end. Each tap fetches a
 * fresh presence token (proof this device is on the J floor network) and
 * hands it to the action. Once the server accepts the action, the door's
 * attempt (`doorLog.attempt`) is followed and the status says the door is
 * open only after the door has actually reacted. The countdown then runs for
 * `durationMs` on the phone's own clock, from the moment the reaction
 * arrives: the attempt's `actuatedAt` is the server's clock, and a phone's
 * can be seconds off. A door that never reacts says so.
 */
export function createDoorActuation(options: {
	holds: DoorStatusHolds;
	doors: ReturnType<typeof createDoorPositions>;
}) {
	const { holds, doors } = options;
	const unlock = useAction(api.doorActions.unlockDoor);
	const lock = useAction(api.doorActions.lockDoor);
	const attempts = createDoorAttempts(holds);

	async function actuate(slot: LockSlot, action: DoorAction) {
		if (canLock(slot)) doors.reset(slot);
		holds.release(slot);
		attempts.cancel(slot);
		holds.setStatus(slot, { tone: "muted", text: SENDING_TEXT });
		const { errorFallback } = ACTION_COPY[action];
		const presence = await fetchPresenceToken(errorFallback);
		if (presence.isErr()) {
			holdError(holds, slot, presence.error.message);
			return;
		}
		if (presence.value === null) {
			holdWarning(holds, slot, offsiteText(action));
			return;
		}
		const run = action === "unlock" ? unlock : lock;
		const result = await call(
			run.mutateAsync({ lock: slot, presence: presence.value }),
			errorFallback
		);
		if (result.isErr()) {
			holdError(holds, slot, result.error.message);
			return;
		}
		const outcome = result.value;
		if (outcome.status !== "ok") {
			holdRefusal(holds, slot, action, outcome.status);
			return;
		}
		if (outcome.attemptId === null) {
			holdSentUnfollowed(holds, slot, action);
			return;
		}
		if (holds.isDisposed()) return;
		holds.setStatus(slot, { tone: "muted", text: WAKING_TEXT });
		attempts.follow(slot, action, outcome.attemptId);
	}

	return { actuate };
}
