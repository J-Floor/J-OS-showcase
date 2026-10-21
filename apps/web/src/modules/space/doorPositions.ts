import { useAction } from "convex-solidjs";
import {
	createEffect,
	createMemo,
	createSignal,
	on,
	onCleanup,
	type Accessor,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import {
	FRESH_MIN_AGE_MS,
	canLock,
	type LockSlot,
} from "../../../convex/lib/doorLocks.ts";
import { type DoorPosition } from "../../../convex/lib/doorProvider.ts";
import { call } from "../../lib/call.ts";

import { LOCK_SLOTS } from "./lockSlots.ts";

const POSITION_POLL_MS = 30_000;

/** The doors whose bolt can be read: the ones that can lock. */
export const LOCKABLE_SLOTS = LOCK_SLOTS.filter(({ slot }) =>
	canLock(slot)
).map(({ slot }) => slot);

/** The doors with a re-check in flight or waiting. */
function createCheckingSet() {
	const [checking, setChecking] = createSignal<ReadonlySet<LockSlot>>(
		new Set()
	);
	return {
		has: (slot: LockSlot): boolean => checking().has(slot),
		start(slot: LockSlot) {
			setChecking((current) => new Set(current).add(slot));
		},
		stop(slot: LockSlot) {
			setChecking((current) => {
				const next = new Set(current);
				next.delete(slot);
				return next;
			});
		},
	};
}

/** Each door's one fresh read waiting out `FRESH_MIN_AGE_MS`, cleared when
 *  the owner is disposed. */
function createFreshTimers() {
	const timers = new Map<LockSlot, ReturnType<typeof setTimeout>>();
	onCleanup(() => {
		for (const timer of timers.values()) clearTimeout(timer);
	});
	function cancel(slot: LockSlot) {
		clearTimeout(timers.get(slot));
		timers.delete(slot);
	}
	return {
		has: (slot: LockSlot): boolean => timers.has(slot),
		cancel,
		schedule(slot: LockSlot, wait: number, run: () => void) {
			cancel(slot);
			timers.set(
				slot,
				setTimeout(() => {
					timers.delete(slot);
					run();
				}, wait)
			);
		},
	};
}

/** Numbers each door's reads; a read landing under an older number than the
 *  door's newest is dropped. */
function createReadNumbers() {
	const numbers = new Map<LockSlot, number>();
	return {
		next(slot: LockSlot): number {
			const id = (numbers.get(slot) ?? 0) + 1;
			numbers.set(slot, id);
			return id;
		},
		isCurrent: (slot: LockSlot, id: number): boolean =>
			numbers.get(slot) === id,
	};
}

/** One server read of a door's bolt; a failed read is `unknown`. */
async function fetchPosition(
	read: {
		mutateAsync: (args: {
			lock: LockSlot;
			fresh?: boolean;
		}) => Promise<DoorPosition>;
	},
	slot: LockSlot,
	isFresh: boolean
): Promise<DoorPosition> {
	const result = await call(
		read.mutateAsync(
			isFresh ? { lock: slot, fresh: isFresh } : { lock: slot }
		),
		"Could not read the door."
	);
	return result.unwrapOr("unknown");
}

/** Reads every lockable door once when `enabled` turns true, then every
 *  `POSITION_POLL_MS` and on a tab becoming visible, until it turns false,
 *  when `onDisable` drops what was read. The first read is fresh, since the
 *  server's routine cache is older than a state shown for the first time may
 *  be, and skips a door an action's status holds. */
function createPositionPoll(
	enabled: Accessor<boolean>,
	poll: {
		readSlot: (slot: LockSlot, isFresh: boolean) => void;
		hasStatus: (slot: LockSlot) => boolean;
		onDisable: () => void;
	}
) {
	function readFirst() {
		for (const slot of LOCKABLE_SLOTS)
			if (!poll.hasStatus(slot)) poll.readSlot(slot, true);
	}
	function readAll() {
		for (const slot of LOCKABLE_SLOTS) poll.readSlot(slot, false);
	}
	/** `enabled` may be a plain function over a document that updates often;
	 *  the memo lets the effect run only on a real true/false change. */
	const isEnabled = createMemo(() => enabled());
	createEffect(
		on(isEnabled, (isOn) => {
			if (!isOn) {
				poll.onDisable();
				return;
			}
			function onVisibilityChange() {
				if (document.visibilityState === "visible") readAll();
			}
			readFirst();
			const timer = setInterval(onVisibilityChange, POSITION_POLL_MS);
			document.addEventListener("visibilitychange", onVisibilityChange);
			onCleanup(() => {
				clearInterval(timer);
				document.removeEventListener(
					"visibilitychange",
					onVisibilityChange
				);
			});
		})
	);
}

/**
 * Where each lockable door's bolt is, read from the server: once when
 * `enabled` turns true (a fresh read, so the first state shown is never
 * older than `FRESH_MIN_AGE_MS`), every 30s and on a tab becoming visible while it
 * stays true, and fresh on demand.
 *
 * `hasStatus` says whether an action's status holds a door. A routine read is
 * skipped then: it could catch the bolt before it moved, and the post-hold
 * fresh read would be served that stale row.
 */
export function createDoorPositions(options: {
	enabled: Accessor<boolean>;
	hasStatus: (slot: LockSlot) => boolean;
}) {
	const read = useAction(api.doorActions.doorPosition);
	/** Where each lockable door's bolt last read; absent = not read yet, or
	 *  cleared by `reset`. A failed read stores `unknown`. */
	const [positions, setPositions] = createSignal<
		Partial<Record<LockSlot, DoorPosition>>
	>({});
	const checking = createCheckingSet();
	const reads = createReadNumbers();
	/** When each door last had a fresh read sent, or last landed
	 *  `unlocking`/`locking`, and the timer of the one fresh read waiting out
	 *  `FRESH_MIN_AGE_MS` after that. The stamp on a landed in-motion read is
	 *  what makes its re-read wait a full `FRESH_MIN_AGE_MS`; without it the
	 *  re-read would go out at once, an extra request the server would only
	 *  serve from cache. */
	const freshSentAt = new Map<LockSlot, number>();
	const freshTimers = createFreshTimers();
	let isDisposed = false;
	onCleanup(() => {
		isDisposed = true;
	});

	function setPosition(slot: LockSlot, value: DoorPosition | undefined) {
		setPositions((current) => ({ ...current, [slot]: value }));
	}

	/** Reads a lockable door's position. Only the newest read of a door lands,
	 *  so a slow poll cannot overwrite a fresher answer, and a routine read is
	 *  skipped while the door's own re-check is in flight or an action's
	 *  status holds the slot. */
	async function readPosition(slot: LockSlot, isFresh: boolean) {
		if (!isFresh && (checking.has(slot) || options.hasStatus(slot))) return;
		const id = reads.next(slot);
		if (isFresh) {
			freshSentAt.set(slot, Date.now());
			checking.start(slot);
		}
		const value = await fetchPosition(read, slot, isFresh);
		if (isDisposed || !reads.isCurrent(slot, id)) return;
		setPosition(slot, value);
		checking.stop(slot);
		if (value !== "unlocking" && value !== "locking") return;

		freshSentAt.set(slot, Date.now());
		recheck(slot);
	}

	/** A fresh read now, or, when the last one went out under
	 *  `FRESH_MIN_AGE_MS` ago, one read when that time is up. A call while a
	 *  read is in flight or waiting does nothing. */
	function recheck(slot: LockSlot) {
		if (checking.has(slot) || freshTimers.has(slot)) return;
		const wait =
			(freshSentAt.get(slot) ?? -Infinity) +
			FRESH_MIN_AGE_MS -
			Date.now();
		if (wait <= 0) {
			void readPosition(slot, true);
			return;
		}
		reads.next(slot);
		checking.start(slot);
		freshTimers.schedule(slot, wait, () => {
			void readPosition(slot, true);
		});
	}

	/** Forgets the reading and drops any read in flight or waiting, for an
	 *  action about to move the bolt. */
	function reset(slot: LockSlot) {
		reads.next(slot);
		freshTimers.cancel(slot);
		setPosition(slot, undefined);
		checking.stop(slot);
	}

	// A reading never outlives the card that showed it: on disable, every
	// door's reads in flight or waiting are dropped, then its reading.
	createPositionPoll(options.enabled, {
		readSlot: (slot, isFresh) => {
			void readPosition(slot, isFresh);
		},
		hasStatus: options.hasStatus,
		onDisable: () => {
			for (const slot of LOCKABLE_SLOTS) reset(slot);
		},
	});

	return {
		/** The bolt's last reading; `undefined` until one lands. */
		position: (slot: LockSlot): DoorPosition | undefined =>
			positions()[slot],
		/** Whether a re-check of the door is in flight or waiting. */
		isChecking: (slot: LockSlot): boolean => checking.has(slot),
		recheck,
		readFresh: (slot: LockSlot) => {
			void readPosition(slot, true);
		},
		reset,
	};
}
