"use node";
import { ConvexError, v, type Infer } from "convex/values";

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
import { lockSlot } from "./schema.ts";

/** Writes the door-log row for a door action the lock refused or that
 *  failed (`operation: "unlock"` / `"lock"`). */
async function recordDoorLog(
	ctx: ActionCtx,
	row: Infer<typeof doorLogRecordRow>
): Promise<void> {
	await ctx.runMutation(internal.doorLog.record, { rows: [row] });
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
	ctx: ActionCtx,
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
		if (stored === null)
			throw new Error(`an accepted ${doorAction} ended ${state.phase}`);
		return await ctx.runMutation(internal.doorLog.recordAttempt, {
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
	} catch (err) {
		// eslint-disable-next-line no-console -- the only trace of a door action whose audit row was lost
		console.error(
			`${fnName}: audit row lost for ${who.email} (${slot}, ok): ${errorMessage(err)}`
		);
		return null;
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
 * thrown as `ConvexError` so their message survives Convex's production
 * redaction of plain `Error`s. A failure from the provider itself is left as
 * a plain `Error`: it is logged here and never shown verbatim to the user
 * (`UnlockCard` falls back to a generic message for anything that is not a
 * `ConvexError`).
 */
async function actuateDoor(
	ctx: ActionCtx,
	args: Infer<typeof doorActionArgs>,
	doorAction: DoorAction,
	fnName: string
): Promise<DoorActionOutcome> {
	const secret = process.env.DOOR_PRESENCE_SECRET;
	if (!secret) throw new ConvexError(`Door ${doorAction} is not configured.`);
	if (!(await verifyPresenceToken(secret, args.presence, Date.now())))
		throw new ConvexError(
			`You need to be on the J floor Wi-Fi to ${doorAction}.`
		);

	const who = await ctx.runQuery(internal.doorInternal.doorActionContext, {
		lock: args.lock,
		action: doorAction,
	});
	if (!who)
		throw new ConvexError(
			`Door ${doorAction} is not available for your account.`
		);
	if (
		who.lastSameActionUntil !== undefined &&
		Date.now() < who.lastSameActionUntil
	)
		return { status: "debounced" };

	// A door action writes to the real lock account, which every deployment
	// holding the provider credentials shares, so the factory refuses unless
	// this deployment is opted in to door writes.
	const provider = doorProvider({ requireWrites: true });
	const base = {
		operation: doorAction,
		trigger: "app" as const,
		email: who.email,
		name: who.name,
		personId: who.personId,
		actorId: who.personId,
	};

	// Taken before the provider is called: the row's `at` is stamped by the
	// insert, after the provider answered.
	const requestedAt = Date.now();
	// Only the actuation itself is caught: a log-write failure AFTER a
	// successful buzz must not be mistaken for a failed actuation.
	let result: DoorActionResult;
	try {
		// By slot: the provider resolves it to its own lock, and its
		// "is this lock configured" check lives there too.
		result = await provider.actuate(args.lock, doorAction);
	} catch (err) {
		await recordDoorLog(ctx, {
			...base,
			slot: args.lock,
			lockNames: [args.lock],
			outcome: "failed",
			detail: errorMessage(err),
		});
		throw err;
	}
	if (result.status === "ok" && LOCK_CAPABILITIES[args.lock].canLock) {
		try {
			await ctx.runMutation(
				internal.doorInternal.clearDoorPositionCache,
				{ slot: args.lock }
			);
		} catch (err) {
			// eslint-disable-next-line no-console -- a stale cached position only lingers until its TTL
			console.error(
				`${fnName}: cache clear failed (${args.lock}): ${errorMessage(err)}`
			);
		}
	}
	if (result.status === "ok")
		return {
			status: "ok",
			attemptId: await recordAccepted(ctx, {
				who,
				slot: args.lock,
				doorAction,
				result,
				requestedAt,
				fnName,
			}),
		};
	// The lock refused it, so nothing was actuated and there is no attempt to
	// follow. A failed audit write must not turn that into an error for the
	// person at the door — report the lost row to the logs and still return
	// the real result.
	try {
		await recordDoorLog(ctx, {
			...base,
			slot: args.lock,
			lockNames: [result.lockName],
			...(result.status === "busy"
				? {
						outcome: "busy" as const,
						detail: "still carrying out the previous command",
					}
				: { outcome: "failed" as const, detail: "offline" }),
		});
	} catch (err) {
		// eslint-disable-next-line no-console -- the only trace of a door action whose audit row was lost
		console.error(
			`${fnName}: audit row lost for ${who.email} (${args.lock}, ${result.status}): ${errorMessage(err)}`
		);
	}
	return { status: result.status };
}

/**
 * Open a door from the Space page. See {@link actuateDoor} for the gates,
 * logging, attempt and error contract.
 */
export const unlockDoor = action({
	args: doorActionArgs.fields,
	handler: (ctx, args): Promise<DoorActionOutcome> =>
		actuateDoor(ctx, args, "unlock", "unlockDoor"),
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
	handler: async (ctx, args): Promise<DoorActionOutcome> => {
		if (!LOCK_CAPABILITIES[args.lock].canLock)
			throw new ConvexError("This door locks by itself.");
		return actuateDoor(ctx, args, "lock", "lockDoor");
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
	handler: async (ctx, args): Promise<DoorPosition> => {
		if (!LOCK_CAPABILITIES[args.lock].canLock)
			throw new ConvexError("This door's position is not shown.");
		if (!(await ctx.runQuery(internal.doorInternal.canSeeDoorPosition, {})))
			throw new ConvexError(
				"Door position is not available for your account."
			);
		const cached = await ctx.runQuery(
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
		const position = await doorProvider({ requireWrites: false }).position(
			args.lock
		);
		try {
			await ctx.runMutation(
				internal.doorInternal.writeDoorPositionCache,
				{
					slot: args.lock,
					position,
					checkedAt: Date.now(),
				}
			);
		} catch (err) {
			// eslint-disable-next-line no-console -- a lost cache write only costs a repeat provider read
			console.error(
				`doorPosition: cache write failed (${args.lock}): ${errorMessage(err)}`
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
	handler: async (ctx, args): Promise<null> => {
		let position: DoorPosition;
		try {
			// A read is harmless on the shared lock account, so it skips the
			// door-writes opt-in.
			position = await doorProvider({ requireWrites: false }).position(
				args.slot
			);
		} catch (err) {
			// eslint-disable-next-line no-console -- the only trace of a failed poll read
			console.warn(
				`pollActuation: position read failed (${args.slot}): ${errorMessage(err)}`
			);
			position = "unknown";
		}
		await ctx.runMutation(internal.doorLog.applyActuationReading, {
			id: args.id,
			action: args.action,
			positionBefore: args.positionBefore,
			position,
			at: Date.now(),
		});
		return null;
	},
});
