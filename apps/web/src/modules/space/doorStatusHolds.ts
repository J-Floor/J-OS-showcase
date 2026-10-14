import { createSignal, onCleanup } from "solid-js";

import { type LockSlot } from "../../../convex/lib/doorLocks.ts";

import { type DoorStatus } from "./doorView.ts";

const COUNTDOWN_TICK_MS = 1000;

/**
 * The status text standing in for each door's buttons, from the tap until its
 * hold ends — never earlier, since the server refuses repeats until then.
 * `onHoldEnd` runs when a hold runs out, after the status is cleared.
 */
export function createDoorStatusHolds(onHoldEnd: (slot: LockSlot) => void) {
	const [statuses, setStatuses] = createSignal<
		ReadonlyMap<LockSlot, DoorStatus>
	>(new Map());
	const holds = new Map<LockSlot, () => void>();
	let isDisposed = false;
	onCleanup(() => {
		isDisposed = true;
		for (const stop of holds.values()) stop();
	});

	function setStatus(slot: LockSlot, status: DoorStatus | null) {
		setStatuses((current) => {
			const next = new Map(current);
			if (status) next.set(slot, status);
			else next.delete(slot);
			return next;
		});
	}

	return {
		statuses,
		setStatus,
		isDisposed: (): boolean => isDisposed,
		/** Ends `slot`'s hold early, if it has one. */
		release(slot: LockSlot) {
			holds.get(slot)?.();
		},
		/** Shows `status` for `slot`, then brings its buttons back after `ms`.
		 *  With `countdown`, the text is rebuilt every second from the time
		 *  left. */
		hold(
			slot: LockSlot,
			status: DoorStatus,
			ms: number,
			countdown?: (remainingMs: number) => string
		) {
			if (isDisposed) return;
			holds.get(slot)?.();
			setStatus(slot, status);
			let remaining = ms;
			const interval = countdown
				? setInterval(() => {
						remaining -= COUNTDOWN_TICK_MS;
						if (remaining <= 0) return;
						setStatus(slot, {
							...status,
							text: countdown(remaining),
						});
					}, COUNTDOWN_TICK_MS)
				: undefined;
			const timer = setTimeout(() => {
				stop();
				setStatus(slot, null);
				onHoldEnd(slot);
			}, ms);
			function stop() {
				clearInterval(interval);
				clearTimeout(timer);
				holds.delete(slot);
			}
			holds.set(slot, stop);
		},
	};
}

export type DoorStatusHolds = ReturnType<typeof createDoorStatusHolds>;
