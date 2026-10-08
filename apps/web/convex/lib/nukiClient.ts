// Pure Nuki Web API client. `fetch` is injected so it is unit-testable and can
// run inside the Node action without any node-only APIs. No "use node" here.
import { parseCsv } from "./csv.ts";
import type { LockSlot } from "./doorLocks.ts";
import { unknownLockName } from "./doorProvider.ts";
import type {
	DoorAction,
	DoorActionResult,
	DoorModel,
	DoorPosition,
	DoorProvider,
	LockStatus,
} from "./doorProvider.ts";
import { normalizeEmail } from "./emailAddress.ts";

/** The smartlock id of each door this app manages, read from the
 *  environment. The app addresses doors by slot, and only this adapter turns a
 *  slot into an id. A missing variable throws: nothing may fall back to an
 *  id that was not configured. */
export function lockSlotIds(): Record<LockSlot, string> {
	const downstairs = process.env.NUKI_LOCK_DOWNSTAIRS?.trim();
	if (!downstairs) throw new Error("NUKI_LOCK_DOWNSTAIRS is not set.");
	const upstairs = process.env.NUKI_LOCK_UPSTAIRS?.trim();
	if (!upstairs) throw new Error("NUKI_LOCK_UPSTAIRS is not set.");
	return { downstairs, upstairs };
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
function nukiEnv(): { token: string; lockIds: string[] } {
	const token = process.env.NUKI_API_TOKEN;
	if (!token) throw new Error("NUKI_API_TOKEN is not set.");
	const lockIds = parseLockIds(process.env.NUKI_SMARTLOCK_IDS);
	if (lockIds.length === 0) throw new Error("NUKI_SMARTLOCK_IDS is not set.");
	return { token, lockIds };
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

/** What a write-requiring caller throws when this deployment is not opted
 *  in to writes. Owned here so no generic caller has to name the env var. */
const WRITES_DISABLED =
	'Door writes are disabled on this deployment (NUKI_WRITE_ENABLED is not "1"), so nothing was sent to the lock.';

const OPENER_TYPE = 2;

/**
 * The adapter's entry point for generic code (re-exported by
 * `lib/doorProviderEnv.ts`): a real {@link nukiProvider} built from
 * {@link nukiEnv}. `requireWrites: true` is for a caller about to write to
 * the Nuki account (a door action) and throws {@link WRITES_DISABLED} unless
 * {@link doorWritesEnabled}; `false` is for a read, or a write whose caller
 * already checked the gate. Reads are never gated.
 */
export function doorProviderFromEnv(opts: {
	requireWrites: boolean;
}): DoorProvider {
	if (opts.requireWrites && !doorWritesEnabled())
		throw new Error(WRITES_DISABLED);
	const { token, lockIds } = nukiEnv();
	return nukiProvider({ fetch, token }, lockIds);
}

/**
 * The Nuki action int for a door action on a device of this type.
 *
 * Unlock: an Opener (2) opens by actuating the electric strike — action 3,
 * the "buzz". Every Smart Lock variant (0, 3, 4, 5) opens with action 1,
 * unlock: the bolt retracts and the handle opens the door, which is what the
 * Nuki app's Unlock button does.
 *
 * Lock: a Smart Lock locks with action 2. An Opener has NO lock action (the
 * street door it buzzes locks by itself), so locking one throws.
 *
 * A Box (1) or an unknown type is refused rather than guessed at.
 */
export function nukiActionFor(
	type: number | undefined,
	action: DoorAction
): number {
	if (type === OPENER_TYPE) {
		if (action === "unlock") return 3;
		throw new Error("A Nuki Opener cannot lock: it has no lock action.");
	}
	if (type === 0 || type === 3 || type === 4 || type === 5)
		return action === "unlock" ? 1 : 2;
	throw new Error(`Unsupported Nuki device type: ${String(type)}`);
}

/** The app's position for an Opener state code: 1 online and idle (the
 *  street door is shut), 7 opening, 5 open. Every other Opener code (3,
 *  ring-to-open active, among them) is one the app does not model. */
function openerPositionFor(state: number | undefined): DoorPosition {
	switch (state) {
		case 1:
			return "locked";
		case 7:
			return "unlocking";
		case 5:
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
		case 3:
		case 5:
		case 6:
			return "unlocked";
		case 2:
		case 7:
			return "unlocking";
		case 4:
			return "locking";
		default:
			return "unknown";
	}
}

/** How long the action's effect lasts at the door: an Opener keeps the street
 *  door released for its strike delay + duration; a Smart Lock reports no
 *  turn time, so a fixed estimate. */
function actionDurationMs(lock: Smartlock): number {
	if (lock.type !== 2) return SMART_LOCK_TURN_MS;
	const cfg = lock.openerAdvancedConfig;
	return (
		(cfg?.electricStrikeDelay ?? 0) +
		(cfg?.electricStrikeDuration ?? STRIKE_FALLBACK_MS)
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

function retryableStatus(status: number): boolean {
	return status === 429 || status === 408 || status >= 500;
}

/** Delay before retry `n` (1-based): `min(8000, 750 * 2^(n-1))`. */
function backoffMs(retry: number): number {
	return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (retry - 1));
}

/** A non-2xx Nuki response, carrying its HTTP status for callers that treat
 *  one status differently (`actuate` and 423). */
class NukiHttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "NukiHttpError";
		this.status = status;
	}
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
async function req(
	deps: NukiDeps,
	method: string,
	path: string,
	body?: unknown,
	opts: { retries?: number } = {}
): Promise<unknown> {
	const wait = deps.sleep ?? sleep;
	const retries = opts.retries ?? RETRIES;
	let last: unknown;

	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) await wait(backoffMs(attempt));
		let res: Response;
		try {
			res = await send();
		} catch (e) {
			last = e;
			if (attempt === retries) throw e;
			continue;
		}
		if (res.ok) {
			if (res.status === 204) return null; // auth-create returns No Content
			return res.json().catch(() => null);
		}
		const text = await res.text().catch(() => "");
		const err = new NukiHttpError(
			res.status,
			`Nuki ${method} ${path} failed: ${String(res.status)} ${text}`
		);
		last = err;
		if (!retryableStatus(res.status) || attempt === retries) throw err;
	}
	throw last;

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
export async function listAccountUsers(deps: NukiDeps): Promise<AccountUser[]> {
	return (await req(deps, "GET", "/account/user")) as AccountUser[];
}

/** Every smartlock authorization on the team (across all locks and users). */
async function listSmartlockAuths(deps: NukiDeps): Promise<SmartlockAuth[]> {
	return (await req(deps, "GET", "/smartlock/auth")) as SmartlockAuth[];
}

/** Every lock on the team, with the health flag Nuki reports for it. */
async function listSmartlocks(deps: NukiDeps): Promise<Smartlock[]> {
	return (await req(deps, "GET", "/smartlock")) as Smartlock[];
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

export async function readSnapshot(deps: NukiDeps): Promise<NukiSnapshot> {
	const [users, auths, locks] = await Promise.all([
		listAccountUsers(deps),
		listSmartlockAuths(deps),
		listSmartlocks(deps),
	]);
	return { users, auths, locks };
}

/**
 * One row per configured lock: name plus whether the cloud currently reports
 * it reachable (`serverState === 0`). Missing ids count as offline.
 */
export function configuredLockStatus(
	locks: Smartlock[],
	lockIds: string[]
): LockStatus[] {
	const byId = new Map(locks.map((s) => [String(s.smartlockId), s]));
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
		.filter((u) => normalizeEmail(u.email) === wanted)
		.map((u) => u.accountUserId);
}

type NukiLogEntry = { action: number; date: string };

/**
 * Fetch a smart lock's activity log since `sinceIso`. Used by the occupancy
 * provider to count door-open events. The Nuki Web API returns newest-first.
 */
export async function fetchSmartlockLog(
	deps: NukiDeps,
	args: { lockId: string; sinceIso: string }
): Promise<NukiLogEntry[]> {
	const params = new URLSearchParams({
		smartlockId: args.lockId,
		fromDate: args.sinceIso,
		limit: "200",
	});
	return (await req(
		deps,
		"GET",
		`/smartlock/log?${params.toString()}`
	)) as NukiLogEntry[];
}

/**
 * Delete the given smartlock authorizations. Nuki's bulk async delete takes an
 * array of auth ids; no-op on an empty list to avoid a pointless call.
 */
export async function revokeAuthIds(
	deps: NukiDeps,
	authIds: string[]
): Promise<void> {
	if (authIds.length === 0) return;
	await req(deps, "DELETE", "/smartlock/auth", authIds);
}

/**
 * Nuki's implementation of {@link DoorProvider}: one account-wide read, bulk
 * revoke by auth id, and the app's door actions. Nuki quirks — auths with no
 * `accountUserId`, the lock's own "Nuki Web" authorization — live in this one
 * factory.
 */
export function nukiProvider(deps: NukiDeps, lockIds: string[]): DoorProvider {
	const configured = new Set(lockIds);
	const slotIds = lockSlotIds();
	/** Configured AND ours: the provider account may carry locks that are not
	 *  ours (see {@link isManagedLock}), so nothing that deletes from the model can
	 *  ever target them, whatever NUKI_SMARTLOCK_IDS says. */
	const managed = new Set(lockIds.filter((id) => isManagedLock(id, slotIds)));
	return {
		async readLockStatus(): Promise<LockStatus[]> {
			// One account-wide lock read, not readModel's three: health needs
			// only the locks.
			return configuredLockStatus(await listSmartlocks(deps), lockIds);
		},
		async readModel(): Promise<DoorModel> {
			const snap = await readSnapshot(deps);

			// One identity per email — this account has addresses split across
			// several account-user records, so identity is keyed by email, not
			// by record. Keyed by the normalized email, so casing variants of one
			// address are one identity; the identity keeps the provider's own
			// spelling as its `email`.
			const byEmail = new Map<
				string,
				{ providerUserId: string; email: string }
			>();
			for (const u of snap.users) {
				const key = normalizeEmail(u.email);
				if (!byEmail.has(key))
					byEmail.set(key, {
						providerUserId: String(u.accountUserId),
						email: u.email,
					});
			}
			const identities = [...byEmail.values()].map((base) => {
				// This identity's own account-user auths on configured locks:
				// those keyed to any account user on the address. An auth with
				// no account user (app pairing, a direct share, a device) never
				// enters the model. The lock's own Nuki Web authorization is
				// infrastructure, not a key: per the `DoorProvider.readModel`
				// contract it never enters the model either, so nothing that
				// deletes from the model can target it — deleting it cuts the
				// lock off from this API. This is the only place that rule lives.
				const userIds = new Set(
					accountUserIdsFor(snap.users, base.email)
				);
				const authIds = snap.auths
					.filter(
						(a) =>
							a.accountUserId !== undefined &&
							userIds.has(a.accountUserId) &&
							a.name !== NUKI_WEB_AUTH_NAME &&
							managed.has(String(a.smartlockId))
					)
					.map((a) => ({
						lockId: String(a.smartlockId),
						authId: a.id,
					}));
				return { ...base, authIds };
			});

			// The lock id → name source for every door-log line: one entry per
			// CONFIGURED id, named by its id when Nuki did not return it — see
			// `lockNamesFromModel`.
			const locks = [...configured].map((lockId) => {
				const lock = snap.locks.find(
					(l) => String(l.smartlockId) === lockId
				);
				return { lockId, name: lock?.name ?? lockId };
			});

			return { identities, locks };
		},

		revokeAuthIds(authIds): Promise<void> {
			return revokeAuthIds(deps, authIds);
		},

		async actuate(slot, action): Promise<DoorActionResult> {
			const lockId = slotIds[slot];
			if (!configured.has(lockId))
				throw new Error(`Lock ${lockId} is not configured.`);
			// One lock read, not readModel's three account-wide reads: someone
			// is standing at the door. Neither request is retried.
			const lock = (await req(
				deps,
				"GET",
				`/smartlock/${lockId}`,
				undefined,
				{ retries: 0 }
			)) as Smartlock;
			// Resolved before the offline check and the POST, so an action the
			// device cannot do (lock on an Opener) always throws, online or
			// not, without sending anything.
			const nukiAction = nukiActionFor(lock.type, action);
			const lockName = lock.name ?? lockId;
			if ((lock.serverState ?? 0) !== 0)
				return { status: "offline", lockName };
			try {
				await req(
					deps,
					"POST",
					`/smartlock/${lockId}/action`,
					{ action: nukiAction, option: 0 },
					{ retries: 0 }
				);
			} catch (err) {
				// 423 Locked: the device is still carrying out the previous
				// command (an Opener buzz takes several seconds). Not a fault —
				// the person at the door just needs to wait a moment.
				if (err instanceof NukiHttpError && err.status === 423)
					return { status: "busy", lockName };
				throw err;
			}
			return {
				status: "ok",
				lockName,
				durationMs: actionDurationMs(lock),
				positionBefore: positionFor(lock.type, lock.state?.state),
			};
		},

		async position(slot): Promise<DoorPosition> {
			const lockId = slotIds[slot];
			if (!configured.has(lockId))
				throw new Error(`Lock ${lockId} is not configured.`);
			const lock = (await req(
				deps,
				"GET",
				`/smartlock/${lockId}`,
				undefined,
				{ retries: 0 }
			)) as Smartlock;
			if ((lock.serverState ?? 0) !== 0) return "offline";
			const position = positionFor(lock.type, lock.state?.state);
			if (position === "unknown")
				// eslint-disable-next-line no-console -- the only trace of which state code the lock reported
				console.warn(
					`position: ${slot} reports Nuki state ${lock.state?.state} (serverState ${lock.serverState})`
				);
			return position;
		},
	};
}
