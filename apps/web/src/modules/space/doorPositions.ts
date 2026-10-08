import { useAction } from "convex-solidjs";
import {
	createEffect,
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

import { LOCK_SLOTS } from "./lockSlots.ts";

const POSITION_POLL_MS = 30_000;

/** The doors whose bolt can be read: the ones that can lock. */
export const LOCKABLE_SLOTS = LOCK_SLOTS.filter(({ slot }) =>
	canLock(slot)
).map(({ slot }) => slot);

/**
 * Where each lockable door's bolt is, read from the server: once when
 * `enabled` turns true, every 30s and on a tab becoming visible while it
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
	const [checking, setChecking] = createSignal<ReadonlySet<LockSlot>>(
		new Set()
	);
	const reads = new Map<LockSlot, number>();
	/** When each door last had a fresh read sent, or last landed
	 *  `unlocking`/`locking`, and the timer of the one fresh read waiting out
	 *  `FRESH_MIN_AGE_MS` after that. The stamp on a landed in-motion read is
	 *  what makes its re-read wait a full `FRESH_MIN_AGE_MS`; without it the
	 *  re-read would go out at once, an extra request the server would only
	 *  serve from cache. */
	const freshSentAt = new Map<LockSlot, number>();
	const freshTimers = new Map<LockSlot, ReturnType<typeof setTimeout>>();
	let disposed = false;
	onCleanup(() => {
		disposed = true;
		for (const timer of freshTimers.values()) clearTimeout(timer);
	});

	function stopChecking(slot: LockSlot) {
		setChecking((c) => {
			const next = new Set(c);
			next.delete(slot);
			return next;
		});
	}

	function setPosition(slot: LockSlot, value: DoorPosition | undefined) {
		setPositions((p) => ({ ...p, [slot]: value }));
	}

	/** Reads a lockable door's position. Only the newest read of a door lands,
	 *  so a slow poll cannot overwrite a fresher answer, and a routine read is
	 *  skipped while the door's own re-check is in flight or an action's
	 *  status holds the slot. */
	async function readPosition(slot: LockSlot, fresh: boolean) {
		if (!fresh && (checking().has(slot) || options.hasStatus(slot))) return;
		const id = (reads.get(slot) ?? 0) + 1;
		reads.set(slot, id);
		if (fresh) {
			freshSentAt.set(slot, Date.now());
			setChecking((c) => new Set(c).add(slot));
		}
		let value: DoorPosition;
		try {
			value = await read.mutateAsync(
				fresh ? { lock: slot, fresh } : { lock: slot }
			);
		} catch {
			value = "unknown";
		}
		if (disposed || reads.get(slot) !== id) return;
		setPosition(slot, value);
		stopChecking(slot);
		if (value === "unlocking" || value === "locking") {
			freshSentAt.set(slot, Date.now());
			recheck(slot);
		}
	}

	/** A fresh read now, or, when the last one went out under
	 *  `FRESH_MIN_AGE_MS` ago, one read when that time is up. A call while a
	 *  read is in flight or waiting does nothing. */
	function recheck(slot: LockSlot) {
		if (checking().has(slot) || freshTimers.has(slot)) return;
		const wait =
			(freshSentAt.get(slot) ?? -Infinity) +
			FRESH_MIN_AGE_MS -
			Date.now();
		if (wait <= 0) {
			void readPosition(slot, true);
			return;
		}
		reads.set(slot, (reads.get(slot) ?? 0) + 1);
		setChecking((c) => new Set(c).add(slot));
		clearTimeout(freshTimers.get(slot));
		freshTimers.set(
			slot,
			setTimeout(() => {
				freshTimers.delete(slot);
				void readPosition(slot, true);
			}, wait)
		);
	}

	function readAll() {
		for (const slot of LOCKABLE_SLOTS) void readPosition(slot, false);
	}

	createEffect(
		on(options.enabled, (enabled) => {
			if (!enabled) return;
			function onVisibilityChange() {
				if (document.visibilityState === "visible") readAll();
			}
			readAll();
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

	return {
		/** The bolt's last reading; `undefined` until one lands. */
		position: (slot: LockSlot): DoorPosition | undefined =>
			positions()[slot],
		/** Whether a re-check of the door is in flight or waiting. */
		isChecking: (slot: LockSlot): boolean => checking().has(slot),
		recheck,
		readFresh: (slot: LockSlot) => {
			void readPosition(slot, true);
		},
		/** Forgets the reading and drops any read in flight or waiting, for an
		 *  action about to move the bolt. */
		reset(slot: LockSlot) {
			reads.set(slot, (reads.get(slot) ?? 0) + 1);
			clearTimeout(freshTimers.get(slot));
			freshTimers.delete(slot);
			setPosition(slot, undefined);
			stopChecking(slot);
		},
	};
}
