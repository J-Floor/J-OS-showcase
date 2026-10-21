"use node";
import { v, type Infer } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { attemptChain, type doorLogRecordRow } from "./doorLog.ts";
import { storedAttempt, transition } from "./lib/doorActuation.ts";
import {
	FRESH_MIN_AGE_MS,
	LOCK_CAPABILITIES,
	type LockSlot,
} from "./lib/doorLocks.ts";
import { verifyPresenceToken } from "./lib/doorPresence.ts";
import {
	errorMessage,
	type DoorAction,
	type DoorActionResult,
	type DoorPosition,
} from "./lib/doorProvider.ts";
import { doorProvider } from "./lib/doorProviderEnv.ts";
import { doorErrorDetail, type DoorError } from "./lib/errors/door.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { lockSlot } from "./schema.ts";

/** Writes the door-log row for a door action the lock refused or that
 *  failed (`operation: "unlock"` / `"lock"`). */
async function recordDoorLog(
	context: ActionCtx,
	row: Infer<typeof doorLogRecordRow>
): Promise<void> {
	await context.runMutation(internal.doorLog.record, { rows: [row] });
}

/** What an app door action returns. `attemptId` (ok only): the door-log row
 *  that follows the door's reaction (`doorLog.attempt`); null only when that
 *  row could not be written. */
export type DoorActionOutcome =
	| { status: "ok"; attemptId: Id<"doorLog"> | null }
	| { status: "offline" | "busy" | "debounced" };

const doorActionArgs = v.object({
	lock: lockSlot,
	presence: v.string(),
});

/**
 * Writes the door-log row for an action the provider accepted, which also
 * starts watching for the door's reaction (`doorLog.recordAttempt`). Returns
 * the row's id, or null when the write failed: the door has already acted by
 * here, so a lost row is logged and never turned into an error for the
 * person at the door.
 */
async function recordAccepted(
	context: ActionCtx,
	attempt: {
		who: { email: string; name: string; personId: Id<"people"> };
		slot: LockSlot;
		doorAction: DoorAction;
		result: Extract<DoorActionResult, { status: "ok" }>;
		requestedAt: number;
		fnName: string;
	}
): Promise<Id<"doorLog"> | null> {
	const { who, slot, doorAction, result, requestedAt, fnName } = attempt;
	const state = transition(
		{ phase: "sent", action: doorAction, requestedAt },
		{
			type: "ACCEPTED",
			positionBefore: result.positionBefore,
			momentary: LOCK_CAPABILITIES[slot].momentary,
			at: Date.now(),
		}
	);
	try {
		const stored = storedAttempt(state);
		invariant(
			stored !== null,
			`an accepted ${doorAction} ended ${state.phase}`
		);
		return await context.runMutation(internal.doorLog.recordAttempt, {
			action: doorAction,
			slot,
			personId: who.personId,
			email: who.email,
			name: who.name,
			lockName: result.lockName,
			durationMs: result.durationMs,
			positionBefore: result.positionBefore,
			...stored,
		});
	} catch (error) {
		// eslint-disable-next-line no-console -- the only trace of a door action whose audit row was lost
		console.error(
			`${fnName}: audit row lost for ${who.email} (${slot}, ok): ${errorMessage(error)}`
		);
		return null;
	}
}

type DoorActionWho = { email: string; name: string; personId: Id<"people"> };

/**
 * The three gates in front of an actuation: presence, who, debounce. Returns
 * the user-facing refusal for the first two, or null when the same action
 * on the same door is still inside its debounce window.
 */
async function authoriseDoorAction(
	context: ActionCtx,
	args: Infer<typeof doorActionArgs>,
	doorAction: DoorAction
): Promise<Result<DoorActionWho | null, DoorError>> {
	const secret = process.env.DOOR_PRESENCE_SECRET;
	if (!secret) return err({ type: "DoorNotConfigured" });
	if (!(await verifyPresenceToken(secret, args.presence, Date.now())))
		return err({ type: "NotOnBuildingNetwork" });

	const who = await context.runQuery(
		internal.doorInternal.doorActionContext,
		{
			lock: args.lock,
			action: doorAction,
		}
	);
	if (!who) return err({ type: "DoorNotAvailable" });
	const isDebounced =
		who.lastSameActionUntil !== undefined &&
		Date.now() < who.lastSameActionUntil;
	return ok(isDebounced ? null : who);
}

function doorLogBase(who: DoorActionWho, doorAction: DoorAction) {
	return {
		operation: doorAction,
		trigger: "app" as const,
		email: who.email,
		name: who.name,
		personId: who.personId,
		actorId: who.personId,
	};
}

/** Drops the cached bolt position after an accepted action on a lockable door. */
async function clearPositionCacheAfterActuation(
	context: ActionCtx,
	slot: LockSlot,
	result: DoorActionResult,
	functionName: string
): Promise<void> {
	if (result.status !== "ok" || !LOCK_CAPABILITIES[slot].canLock) return;
	try {
		await context.runMutation(
			internal.doorInternal.clearDoorPositionCache,
			{
				slot,
			}
		);
	} catch (error) {
		// eslint-disable-next-line no-console -- a stale cached position only lingers until its TTL
		console.error(
			`${functionName}: cache clear failed (${slot}): ${errorMessage(error)}`
		);
	}
}

/**
 * The lock refused it, so nothing was actuated and there is no attempt to
 * follow. A failed audit write must not turn that into an error for the
 * person at the door: report the lost row to the logs and carry on.
 */
async function recordRefusal(
	context: ActionCtx,
	refusal: {
		base: ReturnType<typeof doorLogBase>;
		slot: LockSlot;
		result: Exclude<DoorActionResult, { status: "ok" }>;
		email: string;
		fnName: string;
	}
): Promise<void> {
	const { base, slot, result, email, fnName } = refusal;
	try {
		await recordDoorLog(context, {
			...base,
			slot,
			lockNames: [result.lockName],
			...(result.status === "busy"
				? {
						outcome: "busy" as const,
						detail: "still carrying out the previous command",
					}
				: { outcome: "failed" as const, detail: "offline" }),
		});
	} catch (error) {
		// eslint-disable-next-line no-console -- the only trace of a door action whose audit row was lost
		console.error(
			`${fnName}: audit row lost for ${email} (${slot}, ${result.status}): ${errorMessage(error)}`
		);
	}
}

/**
 * Unlock (open) or lock a door from the Space page, through the provider's
 * team credentials rather than the member's own key. The one implementation
 * behind `unlockDoor` and `lockDoor`. Gated three ways, in this order:
 *
 *   1. PRESENCE — a token from the `/door/presence` oracle. It proves the
 *      request comes from the building network only while the IP check is
 *      on (`DOOR_PRESENCE_IP_CHECK`); with it off the token does not prove
 *      the building network.
 *   2. WHO — `doorActionContext`: the door opens for them
 *      (`doorOpensFor`) — everyone with granted access, guests included.
 *   3. DEBOUNCE — per DOOR and per ACTION, for the last same action's
 *      `durationMs`, the time its effect lasts at the door:
 *      tapping downstairs then upstairs within the window opens both, and
 *      locking right after unlocking the same door goes through; only a
 *      repeat of the same action on the SAME door is debounced.
 *
 * Every attempt that reaches the provider is written to the door log with
 * `operation` = the action: it is the only per-person record, since the provider
 * logs every app action under the one team-credential identity. `slot` (not `detail`)
 * records which door the row is for (`args.lock`) — a structured field the
 * debounce can index on exactly, rather than matching free-text prose: see
 * `doorActionContext`. An accepted action's row is its attempt
 * (`doorLog.recordAttempt`), which goes on to record when the door reacted;
 * its id is what the card follows. `detail` is prose only here: absent on
 * success, `"offline"` when the lock couldn't be reached, `"still carrying
 * out the previous command"` on a `busy` row (the lock's 'still busy'
 * refusal), and the caught error's message on a thrown failure.
 *
 * User-facing refusals (not configured / off-network / not entitled) are
 * `DoorError` results, unwrapped into a `ConvexError` so their message
 * survives Convex's production redaction of plain `Error`s. A failure from the
 * provider itself reaches the client the same way, as `ConvexError` with
 * code `DoorProviderFailed` and the neutral sentence from the door message
 * map; its raw text (`doorErrorDetail`) goes only to the door-log row and the
 * logs, never to the client.
 */
async function actuateDoor(
	context: ActionCtx,
	args: Infer<typeof doorActionArgs>,
	doorAction: DoorAction,
	functionName: string
): Promise<DoorActionOutcome> {
	const who = unwrap(await authoriseDoorAction(context, args, doorAction));
	if (who === null) return { status: "debounced" };

	// A door action writes to the real lock account, which every deployment
	// holding the provider credentials shares, so the factory refuses unless
	// this deployment is opted in to door writes.
	const provider = unwrap(doorProvider({ requireWrites: true }));
	const base = doorLogBase(who, doorAction);

	// Taken before the provider is called: the row's `at` is stamped by the
	// insert, after the provider answered.
	const requestedAt = Date.now();
	// Only the actuation itself is caught: a log-write failure AFTER a
	// successful buzz must not be mistaken for a failed actuation.
	// By slot: the provider resolves it to its own lock, and its
	// "is this lock configured" check lives there too.
	const actuated = await provider.actuate(args.lock, doorAction);
	if (actuated.isErr())
		await recordDoorLog(context, {
			...base,
			slot: args.lock,
			lockNames: [args.lock],
			outcome: "failed",
			detail: doorErrorDetail(actuated.error),
		});
	const result = unwrap(actuated);
	await clearPositionCacheAfterActuation(
		context,
		args.lock,
		result,
		functionName
	);
	if (result.status === "ok")
		return {
			status: "ok",
			attemptId: await recordAccepted(context, {
				who,
				slot: args.lock,
				doorAction,
				result,
				requestedAt,
				fnName: functionName,
			}),
		};
	await recordRefusal(context, {
		base,
		slot: args.lock,
		result,
		email: who.email,
		fnName: functionName,
	});
	return { status: result.status };
}

/**
 * Open a door from the Space page. See {@link actuateDoor} for the gates,
 * logging, attempt and error contract.
 */
export const unlockDoor = action({
	args: doorActionArgs.fields,
	handler: (context, args): Promise<DoorActionOutcome> =>
		actuateDoor(context, args, "unlock", "unlockDoor"),
});

/**
 * Lock a door from the Space page — only a door whose `LOCK_CAPABILITIES`
 * entry says `canLock`. Downstairs only releases the street door, which locks
 * by itself, so the request is refused up front, before any gate or provider
 * call. The UI never offers it; this is defence in depth. Otherwise exactly
 * {@link actuateDoor}'s gates, logging (`operation: "lock"`) and errors.
 */
export const lockDoor = action({
	args: doorActionArgs.fields,
	handler: async (context, args): Promise<DoorActionOutcome> => {
		if (!LOCK_CAPABILITIES[args.lock].canLock)
			refuse({ type: "DoorLocksItself" });
		return actuateDoor(context, args, "lock", "lockDoor");
	},
});

const POSITION_TTL_MS = 15_000;

/**
 * Where a lockable door's bolt is right now, for the Doors card. A read, so no
 * presence token: gated only on the door opening for the caller. Cached per
 * door for {@link POSITION_TTL_MS} so every viewer's polling shares one
 * provider read; `fresh` skips the cache (after the app moves the bolt itself)
 * unless the cached read is under {@link FRESH_MIN_AGE_MS} old.
 * Refused up front for a door the card shows no position for (the street
 * door, which only buzzes): the card has no use for it, and serving it would
 * only add polling load. An app action's attempt reads the door itself
 * (`pollActuation`), not through here.
 */
export const doorPosition = action({
	args: { lock: lockSlot, fresh: v.optional(v.boolean()) },
	handler: async (context, args): Promise<DoorPosition> => {
		if (!LOCK_CAPABILITIES[args.lock].canLock)
			refuse({ type: "DoorPositionNotShown" });
		if (
			!(await context.runQuery(
				internal.doorInternal.canSeeDoorPosition,
				{}
			))
		)
			refuse({ type: "DoorPositionNotAvailable" });
		const cached = await context.runQuery(
			internal.doorInternal.readDoorPositionCache,
			{
				slot: args.lock,
				freshSince:
					Date.now() -
					(args.fresh ? FRESH_MIN_AGE_MS : POSITION_TTL_MS),
			}
		);
		if (cached !== null) return cached;
		// A read is harmless on the shared lock account, so it skips the
		// door-writes opt-in.
		const provider = unwrap(doorProvider({ requireWrites: false }));
		const position = unwrap(await provider.position(args.lock));
		try {
			await context.runMutation(
				internal.doorInternal.writeDoorPositionCache,
				{
					slot: args.lock,
					position,
					checkedAt: Date.now(),
				}
			);
		} catch (error) {
			// eslint-disable-next-line no-console -- a lost cache write only costs a repeat provider read
			console.error(
				`doorPosition: cache write failed (${args.lock}): ${errorMessage(error)}`
			);
		}
		return position;
	},
});

/**
 * One poll of an app action's attempt: reads the door's position once and
 * hands it to `doorLog.applyActuationReading`, which schedules the next poll
 * while the door has not reacted. Reads the provider directly, not through
 * `doorPosition` and its cache: the cache is shared by every viewer and could
 * serve a reading from before the command. A failed read is no information,
 * like `unknown`, so the attempt keeps polling until it times out.
 */
export const pollActuation = internalAction({
	args: {
		...attemptChain.fields,
		slot: lockSlot,
	},
	handler: async (context, args): Promise<null> => {
		// A read is harmless on the shared lock account, so it skips the
		// door-writes opt-in.
		const read = await doorProvider({ requireWrites: false }).asyncAndThen(
			(provider) => provider.position(args.slot)
		);
		if (read.isErr())
			// eslint-disable-next-line no-console -- the only trace of a failed poll read
			console.warn(
				`pollActuation: position read failed (${args.slot}): ${doorErrorDetail(read.error)}`
			);
		const position: DoorPosition = read.unwrapOr("unknown");
		await context.runMutation(internal.doorLog.applyActuationReading, {
			id: args.id,
			action: args.action,
			positionBefore: args.positionBefore,
			position,
			at: Date.now(),
		});
		return null;
	},
});
