// Provider-agnostic door access model. No Convex, no fetch — pure types and the
// small helpers the door paths share (strict identity match, lock names, error
// text) plus a test seam for injecting a fake provider. A brand swap
// means a new implementation of DoorProvider, not a change here.

import type { LockSlot } from "./doorLocks.ts";
import { normalizeEmail } from "./emailAddress.ts";

export type LockId = string;
export type ProviderUserId = string;

/** A resolvable person-identity on the provider. */
export type DoorIdentity = {
	providerUserId: ProviderUserId;
	email: string;
	/** This identity's account-user authorizations on configured locks — what
	 *  the per-person revoke deletes by. Optional — a
	 *  read path that cannot list auths leaves it undefined. */
	authIds?: { lockId: LockId; authId: string }[];
};

/** One configured lock and its human name — the lock id → name source for
 *  every Door-log line (see {@link lockNamesFromModel}). */
export type DoorLock = {
	lockId: LockId;
	name: string;
};

export type DoorModel = {
	identities: DoorIdentity[];
	/** Exactly one entry per CONFIGURED lock id, in configuration order. A
	 *  configured lock the provider did not return is still listed, named by
	 *  its id. */
	locks: DoorLock[];
};

/** What a door can be told to do from the app. */
export type DoorAction = "unlock" | "lock";

/** What an actuation did. `offline`: the provider reports the lock
 *  unreachable, so nothing was actuated. `busy`: the lock refused it because it
 *  is still carrying out the previous command — nothing new was actuated, and a
 *  retry a few seconds later works. A failed request throws instead.
 *  `durationMs` (ok only): how long the action's effect lasts at the door.
 *  `positionBefore` (ok only): where the door was just before the command was
 *  sent, read in the same request that checked it was reachable — the
 *  baseline a later reading is judged against (`lib/doorActuation#reacted`). */
export type DoorActionResult =
	| {
			status: "ok";
			lockName: string;
			durationMs: number;
			positionBefore: DoorPosition;
	  }
	| { status: "offline" | "busy"; lockName: string };

/** Where a lock's bolt is right now, as the provider last heard.
 *  `unlocking` / `locking`: mid-turn, in that direction. `offline`: the
 *  provider cannot reach the lock. `unknown`: a state the app does not
 *  model. */
export type DoorPosition =
	| "locked"
	| "unlocked"
	| "unlocking"
	| "locking"
	| "offline"
	| "unknown";

/** One configured lock's reachability, for the board's door-health tiles. */
export type LockStatus = {
	lockId: LockId;
	name: string;
	/** Whether the provider can reach the lock right now. */
	online: boolean;
	/** The provider's raw health code: 0 when reachable, -1 when the provider
	 *  did not return the lock at all. Kept because cached door-health rows
	 *  carry it. */
	serverState: number;
};

export type DoorProvider = {
	/** The provider's account, read once. Contract: the model carries only
	 *  people's account keys. A device, an authorization tied to no account,
	 *  and a provider-infrastructure authorization (one the provider itself
	 *  needs to operate the lock, such as its own web-service authorization)
	 *  are filtered out HERE, by the provider, and never appear in
	 *  `identities`. The per-person revoke does not re-check for them.
	 *  Authorizations (in `identities[].authIds`) are only those on
	 *  locks this app manages: the provider leaves out any other lock the account
	 *  carries, so callers do not filter again. */
	readModel(): Promise<DoorModel>;
	revokeAuthIds(authIds: string[]): Promise<void>;
	/** Unlock (open) or lock the door now: one attempt, never retried — a
	 *  retry means someone waiting at the door and, on a buzzer, a second buzz.
	 *  Checks the lock is reachable first and reports `offline` without
	 *  actuating if it is not. Throws for an action the device cannot do (an
	 *  Opener has no lock). The provider resolves the slot to its own lock. */
	actuate(slot: LockSlot, action: DoorAction): Promise<DoorActionResult>;
	/** Every configured lock's reachability, in configuration order: one
	 *  background read (retried on transient failure), never an actuation. */
	readLockStatus(): Promise<LockStatus[]>;
	/** One read of one door's bolt position: never retried, never an
	 *  actuation. The provider resolves the slot to its own lock. */
	position(slot: LockSlot): Promise<DoorPosition>;
};

/**
 * Whether `identity` is the SAME person as `target`, by the only two exact
 * matches this app ever revokes a key on: an equal email, or (when `target`
 * has one) an equal stored provider id. Never a name — a name match is a
 * guess, and a guess is not good enough to delete a key on. Shared by
 * `doorRevoke.managedAuthsOf`'s filter.
 */
export function matchesStrictly(
	identity: { providerUserId: string; email: string },
	target: { email: string; doorUserId?: string }
): boolean {
	return (
		normalizeEmail(identity.email) === normalizeEmail(target.email) ||
		(target.doorUserId !== undefined &&
			identity.providerUserId === target.doorUserId)
	);
}

/** The label for a lock id the provider does not know. */
export function unknownLockName(lockId: LockId): string {
	return `unknown lock ${lockId}`;
}

/**
 * Human names for lock ids, from a provider model's `locks`; an id not in it
 * (not configured) degrades to a label so a typo'd id still reads as a lock.
 * Shared by every door path that writes a Door-log row, so they name locks
 * identically.
 */
export function lockNamesFromModel(model: DoorModel, ids: string[]): string[] {
	const byId = new Map(model.locks.map((l) => [l.lockId, l.name]));
	return ids.map((id) => byId.get(id) ?? unknownLockName(id));
}

/**
 * Test seam. convex-test JSON-round-trips every action argument
 * (`JSON.stringify(convexToJson(...))`) before the handler runs, so a live
 * provider — a class instance whose methods live on the prototype — cannot be
 * passed through an action's args: it is not a Convex value. Tests set the
 * provider here instead; production leaves it undefined and each action builds a
 * real {@link DoorProvider}. It lives in this shared lib so every door action
 * ("default" and "use node" runtimes alike) reads one seam. Reset it to
 * `undefined` in an `afterEach`.
 */
let injectedProvider: DoorProvider | undefined;

export function setDoorProviderForTests(
	provider: DoorProvider | undefined
): void {
	injectedProvider = provider;
}

export function injectedDoorProvider(): DoorProvider | undefined {
	return injectedProvider;
}

/** `e instanceof Error ? e.message : String(e)` — shared so a caught provider
 *  failure reads the same wherever it is logged or reported (the app
 *  door action's audit row). */
export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
