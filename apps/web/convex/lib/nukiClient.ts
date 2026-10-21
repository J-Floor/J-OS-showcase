// Pure Nuki Web API client. `fetch` is injected so it is unit-testable and can
// run inside the Node action without any node-only APIs. No "use node" here.
import {
	err,
	errAsync,
	ok,
	okAsync,
	ResultAsync,
	type Result,
} from "neverthrow";

import { parseCsv } from "./csv.ts";
import type { LockSlot } from "./doorLocks.ts";
import { errorMessage, unknownLockName } from "./doorProvider.ts";
import type {
	DoorAction,
	DoorActionResult,
	DoorModel,
	DoorPosition,
	DoorProvider,
	LockStatus,
} from "./doorProvider.ts";
import { normalizeEmail } from "./emailAddress.ts";
import type { DoorError } from "./errors/door.ts";
import { invariant } from "./result.ts";

// What the Nuki device codes mean: which device types exist, which action int
// opens or locks each, and how a reported state code maps to the app's door
// position. Pure lookups, no requests.
const OPENER_TYPE = 2;
const SMART_LOCK_1_2_TYPE = 0;
const SMART_DOOR_TYPE = 3;
const SMART_LOCK_3_4_TYPE = 4;
const SMART_LOCK_5_TYPE = 5;
const SMART_LOCK_TYPES: ReadonlySet<number> = new Set([
	SMART_LOCK_1_2_TYPE,
	SMART_DOOR_TYPE,
	SMART_LOCK_3_4_TYPE,
	SMART_LOCK_5_TYPE,
]);
const OPENER_STRIKE_ACTION = 3;
const OPENER_STATE_OPEN = 5;
const OPENER_STATE_OPENING = 7;
const STATE_UNLOCKED = 3;
const STATE_LOCKING = 4;
const STATE_UNLATCHED = 5;
const STATE_LOCK_N_GO = 6;
const STATE_UNLATCHING = 7;

/**
 * The Nuki action int for a door action on a device of this type.
 *
 * Unlock: an Opener (2) opens by actuating the electric strike — action 3,
 * the "buzz". Every Smart Lock variant (0, 3, 4, 5) opens with action 1,
 * unlock: the bolt retracts and the handle opens the door, which is what the
 * Nuki app's Unlock button does.
 *
 * Lock: a Smart Lock locks with action 2. An Opener has NO lock action (the
 * street door it buzzes locks by itself), so asking for it is a bug: the app
 * never sends a lock to a door whose capabilities say it cannot lock.
 *
 * A Box (1) or an unknown type is refused rather than guessed at.
 */
export function nukiActionFor(
	type: number | undefined,
	action: DoorAction
): Result<number, DoorError> {
	if (type === OPENER_TYPE) {
		invariant(
			action === "unlock",
			"A Nuki Opener cannot lock: it has no lock action."
		);
		return ok(OPENER_STRIKE_ACTION);
	}
	if (type !== undefined && SMART_LOCK_TYPES.has(type))
		return ok(action === "unlock" ? 1 : 2);
	return err({
		type: "DoorProviderFailed",
		detail: `Unsupported Nuki device type: ${String(type)}`,
	});
}

function notConfigured(detail: string): DoorError {
	return { type: "DoorProviderNotConfigured", detail };
}

/** The app's position for an Opener state code: 1 online and idle (the
 *  street door is shut), 7 opening, 5 open. Every other Opener code (3,
 *  ring-to-open active, among them) is one the app does not model. */
function openerPositionFor(state: number | undefined): DoorPosition {
	switch (state) {
		case 1:
			return "locked";
		case OPENER_STATE_OPENING:
			return "unlocking";
		case OPENER_STATE_OPEN:
			return "unlocked";
		default:
			return "unknown";
	}
}

/** The app's position for a Nuki device's state code, read with the
 *  device's type from the same response. An Opener (2) has its own table
 *  ({@link openerPositionFor}). Every Smart Lock: 1 locked; 3 unlocked,
 *  5 unlatched, 6 unlocked (lock 'n' go) (all open); 2 unlocking and
 *  7 unlatching (both opening); 4 locking. */
function positionFor(
	type: number | undefined,
	state: number | undefined
): DoorPosition {
	if (type === OPENER_TYPE) return openerPositionFor(state);
	switch (state) {
		case 1:
			return "locked";
		case STATE_UNLOCKED:
		case STATE_UNLATCHED:
		case STATE_LOCK_N_GO:
			return "unlocked";
		case 2:
		case STATE_UNLATCHING:
			return "unlocking";
		case STATE_LOCKING:
			return "locking";
		default:
			return "unknown";
	}
}

/** The smartlock id of each door this app manages, read from the
 *  environment. The app addresses doors by slot, and only this adapter turns a
 *  slot into an id. A missing variable is an `Err`: nothing may fall back to
 *  an id that was not configured. */
export function lockSlotIds(): Result<Record<LockSlot, string>, DoorError> {
	const downstairs = process.env.NUKI_LOCK_DOWNSTAIRS?.trim();
	if (!downstairs)
		return err(notConfigured("NUKI_LOCK_DOWNSTAIRS is not set."));
	const upstairs = process.env.NUKI_LOCK_UPSTAIRS?.trim();
	return upstairs
		? ok({ downstairs, upstairs })
		: err(notConfigured("NUKI_LOCK_UPSTAIRS is not set."));
}

/**
 * Whether `lockId` is one of the two locks this app manages. The provider
 * account may carry locks that are not ours, so anything that deletes
 * authorizations filters on the managed ids first, whatever
 * `NUKI_SMARTLOCK_IDS` says.
 */
function isManagedLock(
	lockId: string,
	slotIds: Record<LockSlot, string>
): boolean {
	return lockId === slotIds.downstairs || lockId === slotIds.upstairs;
}

const DEFAULT_BASE = "https://api.nuki.io";

export type NukiDeps = {
	fetch: typeof fetch;
	token: string;
	baseUrl?: string;
	/** Injected so tests can fake time. Defaults to `setTimeout`. */
	sleep?: (ms: number) => Promise<void>;
};

type AccountUser = { accountUserId: number; email: string };
type SmartlockAuth = {
	id: string;
	/** Absent for an auth Nuki did not tie to an account user — e.g. one added
	 *  by app pairing or a direct share. `nukiProvider.readModel` leaves
	 *  these out of the model. */
	accountUserId?: number;
	smartlockId: number | string;
	name?: string;
};
type Smartlock = {
	smartlockId: number | string;
	name?: string;
	/** Nuki's own health flag for the device. `0` is the only healthy value;
	 *  every other code means the Nuki cloud is not in contact with the lock. */
	serverState?: number;
	/** Nuki device type: 0 Smart Lock 1/2, 1 Box, 2 Opener, 3 Smart Door,
	 *  4 Smart Lock 3/4, 5 Smart Lock 5. Decides which action opens it. */
	type?: number;
	/** Opener only: how the electric strike is driven. Both in ms. */
	openerAdvancedConfig?: {
		electricStrikeDelay?: number;
		electricStrikeDuration?: number;
	} | null;
	/** Live device state; `state` is the device's state code. Smart Lock and
	 *  Opener codes mean different things: see {@link positionFor}. */
	state?: { state?: number } | null;
};

/**
 * Whether this deployment may WRITE to the real Nuki account. Nobody is
 * granted a key any more, so this now gates only two things: deleting an
 * authorization (the per-person revoke) and a door action (the app's own
 * unlock/lock). Fail-closed: only the exact value `"1"` opts in.
 *
 * Every deployment that holds `NUKI_API_TOKEN` reaches the same Nuki account —
 * there is one set of physical locks. Without this gate the dev deployment's
 * nightly sweep once invited its seed people to the real doors, and prod's GC
 * then found those strangers and queued their keys for deletion — both the
 * sweep and the GC pass are gone, but the gate stays. Only production sets
 * it; reads (lock health, occupancy) stay ungated.
 */
export function doorWritesEnabled(): boolean {
	return process.env.NUKI_WRITE_ENABLED === "1";
}

/**
 * The name Nuki gives the authorization it creates on a lock when Nuki Web is
 * activated for it. It normally has no account user and is never "used", but it is the
 * Nuki Web service's own access to the lock — the channel this API operates
 * through — not a person's key.
 */
const NUKI_WEB_AUTH_NAME = "Nuki Web";

/** Parse the comma-separated NUKI_SMARTLOCK_IDS env var into trimmed ids. */
export function parseLockIds(raw: string | undefined): string[] {
	return parseCsv(raw);
}

/**
 * This deployment's Nuki credentials, read once and validated: the API token
 * and the configured lock ids. Every door path (the app's own unlock/lock,
 * the per-person revoke) needs these off `process.env`, so they are read here
 * once rather than re-implemented per caller with the same error strings.
 */
function nukiEnvironment(): Result<
	{ token: string; lockIds: string[] },
	DoorError
> {
	const token = process.env.NUKI_API_TOKEN;
	if (!token) return err(notConfigured("NUKI_API_TOKEN is not set."));
	const lockIds = parseLockIds(process.env.NUKI_SMARTLOCK_IDS);
	return lockIds.length === 0
		? err(notConfigured("NUKI_SMARTLOCK_IDS is not set."))
		: ok({ token, lockIds });
}

/** Whether this deployment has the credentials and lock ids a door read
 *  needs. Re-exported by `lib/doorProviderEnv.ts`. */
export function doorProviderConfigured(): boolean {
	return (
		!!process.env.NUKI_API_TOKEN &&
		parseLockIds(process.env.NUKI_SMARTLOCK_IDS).length > 0 &&
		!!process.env.NUKI_LOCK_DOWNSTAIRS &&
		!!process.env.NUKI_LOCK_UPSTAIRS
	);
}

const HTTP_NO_CONTENT = 204;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_LOCKED = 423;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

/**
 * The adapter's entry point for generic code (re-exported by
 * `lib/doorProviderEnv.ts`): a real {@link nukiProvider} built from
 * {@link nukiEnv}. `requireWrites: true` is for a caller about to write to
 * the Nuki account (a door action) and is `DoorWritesDisabled` unless
 * {@link doorWritesEnabled}; `false` is for a read, or a write whose caller
 * already checked the gate. Reads are never gated.
 */
export function doorProviderFromEnvironment(options: {
	requireWrites: boolean;
}): Result<DoorProvider, DoorError> {
	if (options.requireWrites && !doorWritesEnabled())
		return err({ type: "DoorWritesDisabled" });
	const environment = nukiEnvironment();
	return environment.andThen(({ token, lockIds }) =>
		nukiProvider({ fetch, token }, lockIds)
	);
}

/** How long the action's effect lasts at the door: an Opener keeps the street
 *  door released for its strike delay + duration; a Smart Lock reports no
 *  turn time, so a fixed estimate. */
function actionDurationMs(lock: Smartlock): number {
	if (lock.type !== OPENER_TYPE) return SMART_LOCK_TURN_MS;
	const config = lock.openerAdvancedConfig;
	return (
		(config?.electricStrikeDelay ?? 0) +
		(config?.electricStrikeDuration ?? STRIKE_FALLBACK_MS)
	);
}

/** Extra attempts after the first. Nuki publishes no rate-limit headers and no
 *  `Retry-After`, so the schedule is a guess — a deliberately gentle one:
 *  everything retried here is a background read or revoke, never someone
 *  waiting at the door (door actions pass `retries: 0`). */
const RETRIES = 4;
const BACKOFF_BASE_MS = 750;
const BACKOFF_CAP_MS = 8000;
const STRIKE_FALLBACK_MS = 3000;
const SMART_LOCK_TURN_MS = 5000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function pause(deps: NukiDeps, ms: number): Promise<void> {
	return (deps.sleep ?? sleep)(ms);
}

function isRetryableStatus(status: number): boolean {
	return (
		status === HTTP_TOO_MANY_REQUESTS ||
		status === HTTP_REQUEST_TIMEOUT ||
		status >= HTTP_SERVER_ERROR
	);
}

/** The body of a successful response; auth-create returns No Content. */
function readBody(response: Response): Promise<unknown> | null {
	return response.status === HTTP_NO_CONTENT
		? null
		: response.json().catch(() => null);
}

/** The error for a non-2xx response, carrying the status and Nuki's text. */
async function httpFailure(
	method: string,
	path: string,
	response: Response
): Promise<DoorError> {
	const text = await response.text().catch(() => "");
	return {
		type: "DoorProviderFailed",
		status: response.status,
		detail: `Nuki ${method} ${path} failed: ${String(response.status)} ${text}`,
	};
}

/** Delay before retry `n` (1-based): `min(8000, 750 * 2^(n-1))`. */
function backoffMs(retry: number): number {
	return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (retry - 1));
}

/**
 * One Nuki request, retried on transient failure (429, 408, 5xx, or a thrown
 * fetch) unless the caller passes `retries: 0`. Permanent 4xx is not retried.
 *
 * Nuki's gateway starts refusing with a bare nginx `429 Too Many Requests` part
 * way through a sweep — no headers, no `Retry-After`, nothing that says a limit
 * exists until you cross it. Every request after that point failed, and because
 * the caller recorded only the address and not the reason, 29 people were short
 * a lock with nothing anywhere to explain it.
 *
 * Backing off is the second half of the fix; the first is not making the
 * requests at all (see {@link readSnapshot}). A retry loop over a request
 * storm just spreads the storm out.
 */
function request(
	deps: NukiDeps,
	method: string,
	path: string,
	{ body, retries = RETRIES }: { body?: unknown; retries?: number } = {}
): ResultAsync<unknown, DoorError> {
	return new ResultAsync(attemptLoop());

	async function attemptLoop(): Promise<Result<unknown, DoorError>> {
		let last: DoorError = {
			type: "DoorProviderFailed",
			detail: `Nuki ${method} ${path} was never attempted`,
		};
		for (let attempt = 0; attempt <= retries; attempt++) {
			if (attempt > 0) await pause(deps, backoffMs(attempt));
			const sent = await ResultAsync.fromPromise(
				send(),
				(cause): DoorError => ({
					type: "DoorProviderFailed",
					detail: errorMessage(cause),
				})
			);
			if (sent.isErr()) {
				last = sent.error;
				continue;
			}
			const response = sent.value;
			if (response.ok) return ok(await readBody(response));
			last = await httpFailure(method, path, response);
			if (!isRetryableStatus(response.status)) return err(last);
		}
		return err(last);
	}

	function send(): Promise<Response> {
		return deps.fetch(`${deps.baseUrl ?? DEFAULT_BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${deps.token}`,
				"Content-Type": "application/json",
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
	}
}

/** All Nuki account users on the team. */
export function listAccountUsers(
	deps: NukiDeps
): ResultAsync<AccountUser[], DoorError> {
	return request(deps, "GET", "/account/user").map(
		(body) => body as AccountUser[]
	);
}

/** Every smartlock authorization on the team (across all locks and users). */
function listSmartlockAuths(
	deps: NukiDeps
): ResultAsync<SmartlockAuth[], DoorError> {
	return request(deps, "GET", "/smartlock/auth").map(
		(body) => body as SmartlockAuth[]
	);
}

/** Every lock on the team, with the health flag Nuki reports for it. */
function listSmartlocks(deps: NukiDeps): ResultAsync<Smartlock[], DoorError> {
	return request(deps, "GET", "/smartlock").map(
		(body) => body as Smartlock[]
	);
}

/**
 * The whole Nuki account — users, authorizations, locks — read ONCE, in three
 * requests.
 *
 * Reading per person (four GETs each, in a tight loop) once got this account
 * 429ed part way through and left people stranded with no explanation. Reading
 * it once is also consistent: every decision made from it (the per-person
 * revoke, lock health) sees the same picture of the
 * account, rather than each a slightly later one.
 */
type NukiSnapshot = {
	users: AccountUser[];
	auths: SmartlockAuth[];
	locks: Smartlock[];
};

export function readSnapshot(
	deps: NukiDeps
): ResultAsync<NukiSnapshot, DoorError> {
	return ResultAsync.combine([
		listAccountUsers(deps),
		listSmartlockAuths(deps),
		listSmartlocks(deps),
	]).map(([users, auths, locks]) => ({ users, auths, locks }));
}

/**
 * One row per configured lock: name plus whether the cloud currently reports
 * it reachable (`serverState === 0`). Missing ids count as offline.
 */
export function configuredLockStatus(
	locks: Smartlock[],
	lockIds: string[]
): LockStatus[] {
	const byId = new Map(
		locks.map((smartlock) => [String(smartlock.smartlockId), smartlock])
	);
	return lockIds.map((lockId) => {
		const lock = byId.get(lockId);
		if (!lock) {
			return {
				lockId,
				name: unknownLockName(lockId),
				online: false,
				serverState: -1,
			};
		}
		const serverState = lock.serverState ?? 0;
		return {
			lockId,
			name: lock.name ?? lockId,
			online: serverState === 0,
			serverState,
		};
	});
}

/**
 * Every Nuki account user sharing an email, newest id last.
 *
 * Nuki does not enforce one account user per address, and this account has five
 * addresses carrying two records each — with the locks SPLIT across them (one
 * record holds the street door, the other the floor). A person is the email,
 * not the row, so anything asking "what does this person already have?" has to
 * look at all of them.
 *
 * Matched on {@link normalizeEmail} of both sides: Nuki keeps the address as it
 * was first sent, which predates `people.email` being canonical.
 */
function accountUserIdsFor(users: AccountUser[], email: string): number[] {
	const wanted = normalizeEmail(email);
	return users
		.filter((user) => normalizeEmail(user.email) === wanted)
		.map((user) => user.accountUserId);
}

type NukiLogEntry = { action: number; date: string };

/**
 * Fetch a smart lock's activity log since `sinceIso`. Used by the occupancy
 * provider to count door-open events. The Nuki Web API returns newest-first.
 */
export function fetchSmartlockLog(
	deps: NukiDeps,
	args: { lockId: string; sinceIso: string }
): ResultAsync<NukiLogEntry[], DoorError> {
	const params = new URLSearchParams({
		smartlockId: args.lockId,
		fromDate: args.sinceIso,
		limit: "200",
	});
	return request(deps, "GET", `/smartlock/log?${params.toString()}`).map(
		(body) => body as NukiLogEntry[]
	);
}

/**
 * Delete the given smartlock authorizations. Nuki's bulk async delete takes an
 * array of auth ids; no-op on an empty list to avoid a pointless call.
 */
export function revokeAuthIds(
	deps: NukiDeps,
	authIds: string[]
): ResultAsync<void, DoorError> {
	return authIds.length === 0
		? okAsync(undefined)
		: request(deps, "DELETE", "/smartlock/auth", { body: authIds }).map(
				() => {}
			);
}

/**
 * One identity per email — this account has addresses split across several
 * account-user records, so identity is keyed by email, not by record. Keyed by
 * the normalized email, so casing variants of one address are one identity; the
 * identity keeps the provider's own spelling as its `email`.
 *
 * Each identity carries its own account-user auths on configured locks: those
 * keyed to any account user on the address. An auth with no account user (app
 * pairing, a direct share, a device) never enters the model. The lock's own
 * Nuki Web authorization is infrastructure, not a key: per the
 * `DoorProvider.readModel` contract it never enters the model either, so
 * nothing that deletes from the model can target it — deleting it cuts the
 * lock off from this API. This is the only place that rule lives.
 */
function identitiesOf(
	snapshot: NukiSnapshot,
	managed: ReadonlySet<string>
): DoorModel["identities"] {
	const byEmail = new Map<
		string,
		{ providerUserId: string; email: string }
	>();
	for (const user of snapshot.users) {
		const key = normalizeEmail(user.email);
		if (!byEmail.has(key))
			byEmail.set(key, {
				providerUserId: String(user.accountUserId),
				email: user.email,
			});
	}
	return [...byEmail.values()].map((base) => {
		const userIds = new Set(accountUserIdsFor(snapshot.users, base.email));
		const authIds = snapshot.auths
			.filter(
				(auth) =>
					auth.accountUserId !== undefined &&
					userIds.has(auth.accountUserId) &&
					auth.name !== NUKI_WEB_AUTH_NAME &&
					managed.has(String(auth.smartlockId))
			)
			.map((auth) => ({
				lockId: String(auth.smartlockId),
				authId: auth.id,
			}));
		return { ...base, authIds };
	});
}

/**
 * The lock id → name source for every door-log line: one entry per CONFIGURED
 * id, named by its id when Nuki did not return it — see `lockNamesFromModel`.
 */
function lockNamesOf(
	snapshot: NukiSnapshot,
	configured: ReadonlySet<string>
): DoorModel["locks"] {
	return [...configured].map((lockId) => {
		const lock = snapshot.locks.find(
			(candidate) => String(candidate.smartlockId) === lockId
		);
		return { lockId, name: lock?.name ?? lockId };
	});
}

/** The configured lock id behind a slot; an `Err` for one that is not configured. */
function configuredLockId(
	slot: LockSlot,
	slotIds: Record<LockSlot, string>,
	configured: ReadonlySet<string>
): Result<string, DoorError> {
	const lockId = slotIds[slot];
	return configured.has(lockId)
		? ok(lockId)
		: err(notConfigured(`Lock ${lockId} is not configured.`));
}

/** One lock read, not readModel's three account-wide reads: someone is
 *  standing at the door, so it is not retried. */
function readLock(
	deps: NukiDeps,
	lockId: string
): ResultAsync<Smartlock, DoorError> {
	return request(deps, "GET", `/smartlock/${lockId}`, {
		retries: 0,
	}).map((body) => body as Smartlock);
}

/** What an accepted action reports: the effect's duration and where the door
 *  was before the command. */
function acceptedResult(lock: Smartlock, lockName: string): DoorActionResult {
	return {
		status: "ok",
		lockName,
		durationMs: actionDurationMs(lock),
		positionBefore: positionFor(lock.type, lock.state?.state),
	};
}

/** 423 Locked: the device is still carrying out the previous command (an
 *  Opener buzz takes several seconds). Not a fault: the person at the door
 *  just needs to wait a moment. Any other failure stays an `Err`. */
function busyOrFailure(
	failure: DoorError,
	lockName: string
): ResultAsync<DoorActionResult, DoorError> {
	return failure.type === "DoorProviderFailed" &&
		failure.status === HTTP_LOCKED
		? okAsync({ status: "busy", lockName })
		: errAsync(failure);
}

/** The position a lock reports, or `offline` when the provider cannot reach it. */
function positionOf(slot: LockSlot, lock: Smartlock): DoorPosition {
	if ((lock.serverState ?? 0) !== 0) return "offline";
	const position = positionFor(lock.type, lock.state?.state);
	if (position === "unknown")
		// eslint-disable-next-line no-console -- the only trace of which state code the lock reported
		console.warn(
			`position: ${slot} reports Nuki state ${lock.state?.state} (serverState ${lock.serverState})`
		);
	return position;
}

/**
 * Nuki's implementation of {@link DoorProvider}: one account-wide read, bulk
 * revoke by auth id, and the app's door actions. Nuki quirks — auths with no
 * `accountUserId`, the lock's own "Nuki Web" authorization — live in this one
 * factory.
 */
export function nukiProvider(
	deps: NukiDeps,
	lockIds: string[]
): Result<DoorProvider, DoorError> {
	return lockSlotIds().map((slotIds) => {
		const configured = new Set(lockIds);
		/** Configured AND ours: the provider account may carry locks that are not
		 *  ours (see {@link isManagedLock}), so nothing that deletes from the model can
		 *  ever target them, whatever NUKI_SMARTLOCK_IDS says. */
		const managed = new Set(
			lockIds.filter((id) => isManagedLock(id, slotIds))
		);
		return {
			readLockStatus(): ResultAsync<LockStatus[], DoorError> {
				// One account-wide lock read, not readModel's three: health needs
				// only the locks.
				return listSmartlocks(deps).map((locks) =>
					configuredLockStatus(locks, lockIds)
				);
			},
			readModel(): ResultAsync<DoorModel, DoorError> {
				return readSnapshot(deps).map((snapshot) => ({
					identities: identitiesOf(snapshot, managed),
					locks: lockNamesOf(snapshot, configured),
				}));
			},

			revokeAuthIds(authIds): ResultAsync<void, DoorError> {
				return revokeAuthIds(deps, authIds);
			},

			actuate(slot, action): ResultAsync<DoorActionResult, DoorError> {
				return configuredLockId(slot, slotIds, configured)
					.asyncAndThen((lockId) =>
						readLock(deps, lockId).map((lock) => ({ lockId, lock }))
					)
					.andThen(({ lockId, lock }) => {
						// Resolved before the offline check and the POST, so an action
						// the device cannot do always fails, online or not, without
						// sending anything.
						const nukiAction = nukiActionFor(lock.type, action);
						if (nukiAction.isErr())
							return errAsync<DoorActionResult, DoorError>(
								nukiAction.error
							);
						const lockName = lock.name ?? lockId;
						if ((lock.serverState ?? 0) !== 0)
							return okAsync<DoorActionResult, DoorError>({
								status: "offline",
								lockName,
							});
						return request(
							deps,
							"POST",
							`/smartlock/${lockId}/action`,
							{
								body: { action: nukiAction.value, option: 0 },
								retries: 0,
							}
						)
							.map(() => acceptedResult(lock, lockName))
							.orElse((failure) =>
								busyOrFailure(failure, lockName)
							);
					});
			},

			position(slot): ResultAsync<DoorPosition, DoorError> {
				return configuredLockId(slot, slotIds, configured)
					.asyncAndThen((lockId) => readLock(deps, lockId))
					.map((lock) => positionOf(slot, lock));
			},
		};
	});
}
