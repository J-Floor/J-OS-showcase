// In-memory DoorProvider for door tests. A real module (not inline in a test)
// so every test that injects a provider shares one fake.
import { errAsync, okAsync, type ResultAsync } from "neverthrow";

import type { LockSlot } from "./doorLocks.ts";
import type {
	DoorAction,
	DoorActionResult,
	DoorModel,
	DoorPosition,
	DoorProvider,
	LockStatus,
} from "./doorProvider.ts";
import type { DoorError } from "./errors/door.ts";

export const FAKE_ACTION_DURATION_MS = 3000;

/** The fake's lock id for each slot. */
export const FAKE_SLOT_LOCK_IDS: Record<LockSlot, string> = {
	downstairs: "lock-downstairs",
	upstairs: "lock-upstairs",
};

export class FakeDoorProvider implements DoorProvider {
	model: DoorModel;
	/** Locks a test marks unreachable: `actuate` reports them `offline`
	 *  without actuating. A lock not in `model.locks` is offline too. */
	offline: Set<string>;
	calls: {
		revokes: string[][];
		actuations: [LockSlot, DoorAction][];
		lockStatusReads: number;
		positions: LockSlot[];
	};
	/** Locks that refuse an actuation as still busy (the provider's 'still busy' refusal). */
	busyLocks = new Set<string>();
	/** When set, every call fails with this error and records nothing. */
	failure: DoorError | undefined;
	/** Per door, the readings `position` hands out in turn; the last one
	 *  repeats. */
	private readonly readingsBySlot = new Map<LockSlot, DoorPosition[]>();

	constructor(initial: DoorModel) {
		this.model = initial;
		this.offline = new Set();
		this.calls = {
			revokes: [],
			actuations: [],
			lockStatusReads: 0,
			positions: [],
		};
	}

	private succeed<T>(value: T): ResultAsync<T, DoorError> {
		return this.failure ? errAsync(this.failure) : okAsync(value);
	}

	readModel(): ResultAsync<DoorModel, DoorError> {
		return this.succeed(this.model);
	}

	revokeAuthIds(authIds: string[]): ResultAsync<void, DoorError> {
		if (this.failure) return errAsync(this.failure);
		for (const identity of this.model.identities)
			if (identity.authIds)
				identity.authIds = identity.authIds.filter(
					(auth) => !authIds.includes(auth.authId)
				);
		this.calls.revokes.push(authIds);
		return okAsync();
	}

	readLockStatus(): ResultAsync<LockStatus[], DoorError> {
		if (this.failure) return errAsync(this.failure);
		this.calls.lockStatusReads += 1;
		return this.succeed(
			this.model.locks.map((lock) => {
				const isOnline = !this.offline.has(lock.lockId);
				return {
					lockId: lock.lockId,
					name: lock.name,
					online: isOnline,
					serverState: isOnline ? 0 : 1,
				};
			})
		);
	}

	/** What `position` reports for this door from now on. */
	setPosition(slot: LockSlot, position: DoorPosition): void {
		this.queuePositions(slot, [position]);
	}

	/** What the next `position` reads of this door report, one per read, in
	 *  order; the last one repeats from then on. `actuate` reports the next
	 *  one, without using it up, as the door's position before the command. */
	queuePositions(
		slot: LockSlot,
		readings: [DoorPosition, ...DoorPosition[]]
	): void {
		this.readingsBySlot.set(slot, [...readings]);
	}

	position(slot: LockSlot): ResultAsync<DoorPosition, DoorError> {
		if (this.failure) return errAsync(this.failure);
		this.calls.positions.push(slot);
		if (this.offline.has(FAKE_SLOT_LOCK_IDS[slot]))
			return this.succeed("offline");
		const readings = this.readingsBySlot.get(slot);
		const reading = readings?.[0] ?? "unknown";
		if (readings && readings.length > 1) readings.shift();
		return this.succeed(reading);
	}

	actuate(
		slot: LockSlot,
		action: DoorAction
	): ResultAsync<DoorActionResult, DoorError> {
		if (this.failure) return errAsync(this.failure);
		const lockId = FAKE_SLOT_LOCK_IDS[slot];
		// A slot whose lock is not in the model reports `offline` here, while the real provider is an `Err`: not configured; deliberate, the fake has no notion of configuration.
		const lock = this.model.locks.find(
			(candidate) => candidate.lockId === lockId
		);
		const lockName = lock?.name ?? lockId;
		if (!lock || this.offline.has(lockId))
			return okAsync({ status: "offline", lockName });
		if (this.busyLocks.has(lockId))
			return okAsync({ status: "busy", lockName });
		this.calls.actuations.push([slot, action]);
		return okAsync({
			status: "ok",
			lockName,
			durationMs: FAKE_ACTION_DURATION_MS,
			positionBefore: this.readingsBySlot.get(slot)?.[0] ?? "unknown",
		});
	}
}
