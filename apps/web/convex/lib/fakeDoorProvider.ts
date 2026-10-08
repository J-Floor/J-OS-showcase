// In-memory DoorProvider for door tests. A real module (not inline in a test)
// so every test that injects a provider shares one fake.
import type { LockSlot } from "./doorLocks.ts";
import type {
	DoorAction,
	DoorActionResult,
	DoorModel,
	DoorPosition,
	DoorProvider,
	LockId,
	LockStatus,
} from "./doorProvider.ts";

export const FAKE_ACTION_DURATION_MS = 3000;

/** The fake's lock id for each slot. */
export const FAKE_SLOT_LOCK_IDS: Record<LockSlot, LockId> = {
	downstairs: "lock-downstairs",
	upstairs: "lock-upstairs",
};

export class FakeDoorProvider implements DoorProvider {
	model: DoorModel;
	/** Locks a test marks unreachable: `actuate` reports them `offline`
	 *  without actuating. A lock not in `model.locks` is offline too. */
	offline: Set<LockId>;
	calls: {
		revokes: string[][];
		actuations: [LockSlot, DoorAction][];
		lockStatusReads: number;
		positions: LockSlot[];
	};
	/** Locks that refuse an actuation as still busy (the provider's 'still busy' refusal). */
	busyLocks = new Set<LockId>();
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

	readModel(): Promise<DoorModel> {
		return Promise.resolve(this.model);
	}

	revokeAuthIds(authIds: string[]): Promise<void> {
		for (const identity of this.model.identities)
			if (identity.authIds)
				identity.authIds = identity.authIds.filter(
					(a) => !authIds.includes(a.authId)
				);
		this.calls.revokes.push(authIds);
		return Promise.resolve();
	}

	readLockStatus(): Promise<LockStatus[]> {
		this.calls.lockStatusReads += 1;
		return Promise.resolve(
			this.model.locks.map((l) => {
				const online = !this.offline.has(l.lockId);
				return {
					lockId: l.lockId,
					name: l.name,
					online,
					serverState: online ? 0 : 1,
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

	position(slot: LockSlot): Promise<DoorPosition> {
		this.calls.positions.push(slot);
		if (this.offline.has(FAKE_SLOT_LOCK_IDS[slot]))
			return Promise.resolve("offline");
		const readings = this.readingsBySlot.get(slot);
		const reading = readings?.[0] ?? "unknown";
		if (readings && readings.length > 1) readings.shift();
		return Promise.resolve(reading);
	}

	actuate(slot: LockSlot, action: DoorAction): Promise<DoorActionResult> {
		const lockId = FAKE_SLOT_LOCK_IDS[slot];
		// A slot whose lock is not in the model reports `offline` here, while the real provider throws "not configured"; deliberate, the fake has no notion of configuration.
		const lock = this.model.locks.find((l) => l.lockId === lockId);
		const lockName = lock?.name ?? lockId;
		if (!lock || this.offline.has(lockId))
			return Promise.resolve({ status: "offline", lockName });
		if (this.busyLocks.has(lockId))
			return Promise.resolve({ status: "busy", lockName });
		this.calls.actuations.push([slot, action]);
		return Promise.resolve({
			status: "ok",
			lockName,
			durationMs: FAKE_ACTION_DURATION_MS,
			positionBefore: this.readingsBySlot.get(slot)?.[0] ?? "unknown",
		});
	}
}
