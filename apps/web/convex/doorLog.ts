import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { DOOR_LOG_PAGE_SIZE } from "./lib/constants.ts";
import {
	CONFIRM_POLL_MS,
	CONFIRM_WINDOW_MS,
	attemptState,
	storedAttempt,
	transition,
	type ActuationEvent,
	type ActuationState,
	type StoredAttempt,
} from "./lib/doorActuation.ts";
import type { LockSlot } from "./lib/doorLocks.ts";
import { personByEmail } from "./lib/emailAddress.ts";
import { displayName } from "./lib/names.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import {
	doorAction,
	doorActuation,
	doorLogRow,
	doorPosition,
	lockSlot,
} from "./schema.ts";

export type LogRow = Doc<"doorLog"> & { actorName: string | undefined };

async function withActorNames(
	ctx: QueryCtx,
	rows: Doc<"doorLog">[]
): Promise<LogRow[]> {
	const names = new Map<string, string>();
	return Promise.all(
		rows.map(async (row) => {
			if (row.actorId === undefined)
				return { ...row, actorName: undefined };
			const cached = names.get(row.actorId);
			if (cached !== undefined) return { ...row, actorName: cached };
			const actor = await ctx.db.get(row.actorId);
			if (!actor) return { ...row, actorName: undefined };
			const actorName = displayName(actor);
			names.set(row.actorId, actorName);
			return { ...row, actorName };
		})
	);
}

/** The `at` of the DOOR_LOG_PAGE_SIZE-th newest row, or null when the log fits one page. */
export const firstPageFloor = query({
	args: {},
	handler: async (ctx): Promise<{ since: number | null }> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db
			.query("doorLog")
			.withIndex("by_at")
			.order("desc")
			.take(DOOR_LOG_PAGE_SIZE + 1);
		const floor =
			rows.length > DOOR_LOG_PAGE_SIZE
				? rows[DOOR_LOG_PAGE_SIZE - 1]
				: undefined;
		return { since: floor ? floor.at : null };
	},
});

/** Every row with `at >= since` (all rows when null), newest first. */
export const listSince = query({
	args: { since: v.union(v.number(), v.null()) },
	handler: async (ctx, { since }): Promise<LogRow[]> => {
		await requireRole(ctx, BOARD_LEVEL);
		const rows = await ctx.db
			.query("doorLog")
			.withIndex("by_at", (q) =>
				since === null ? q : q.gte("at", since)
			)
			.order("desc")
			.collect();
		return withActorNames(ctx, rows);
	},
});

/** One chunk of rows with `at < before`, newest first. */
export const listBefore = query({
	args: { before: v.number(), paginationOpts: paginationOptsValidator },
	handler: async (
		ctx,
		{ before, paginationOpts }
	): Promise<PaginationResult<LogRow>> => {
		await requireRole(ctx, BOARD_LEVEL);
		const result = await ctx.db
			.query("doorLog")
			.withIndex("by_at", (q) => q.lt("at", before))
			.order("desc")
			.paginate(paginationOpts);
		return { ...result, page: await withActorNames(ctx, result.page) };
	},
});

/** A row `record` accepts: stored rows may lack `personId`, new ones may not. */
export const doorLogRecordRow = v.object({
	...doorLogRow.fields,
	personId: v.id("people"),
});

/** Append one or more door-log rows. */
export const record = internalMutation({
	args: { rows: v.array(doorLogRecordRow) },
	handler: async (ctx, { rows }): Promise<null> => {
		const at = Date.now();
		for (const row of rows) {
			await ctx.db.insert("doorLog", {
				at,
				operation: row.operation,
				trigger: row.trigger,
				detail: row.detail,
				personId: row.personId,
				email: row.email,
				name: row.name,
				lockNames: row.lockNames,
				outcome: row.outcome,
				actorId: row.actorId,
				slot: row.slot,
				durationMs: row.durationMs,
			});
		}
		return null;
	},
});

/** What every poll and the timeout carry: what the row does not store. */
export const attemptChain = v.object({
	id: v.id("doorLog"),
	action: doorAction,
	positionBefore: doorPosition,
});
type AttemptChain = Infer<typeof attemptChain>;

/**
 * Writes the door-log row for an app unlock or lock the provider accepted:
 * the attempt the Doors card follows (`attempt`). While the door has not
 * been seen to react (`accepted`), also schedules the first poll and the
 * timeout, in the same transaction. The timeout is its own job rather than
 * the poll chain's last step, so a poll chain that dies still ends
 * `unconfirmed`.
 */
export const recordAttempt = internalMutation({
	args: {
		action: doorAction,
		slot: lockSlot,
		personId: v.id("people"),
		email: v.string(),
		name: v.string(),
		lockName: v.string(),
		durationMs: v.number(),
		positionBefore: doorPosition,
		actuation: doorActuation,
		requestedAt: v.number(),
		actuatedAt: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<Id<"doorLog">> => {
		const id = await ctx.db.insert("doorLog", {
			at: Date.now(),
			operation: args.action,
			trigger: "app",
			personId: args.personId,
			actorId: args.personId,
			email: args.email,
			name: args.name,
			lockNames: [args.lockName],
			outcome: "ok",
			slot: args.slot,
			durationMs: args.durationMs,
			actuation: args.actuation,
			requestedAt: args.requestedAt,
			actuatedAt: args.actuatedAt,
		});
		if (args.actuation === "accepted") {
			const chain: AttemptChain = {
				id,
				action: args.action,
				positionBefore: args.positionBefore,
			};
			await ctx.scheduler.runAfter(
				CONFIRM_POLL_MS,
				internal.doorActions.pollActuation,
				{ ...chain, slot: args.slot }
			);
			await ctx.scheduler.runAt(
				args.requestedAt + CONFIRM_WINDOW_MS,
				internal.doorLog.actuationTimeout,
				chain
			);
		}
		return id;
	},
});

/**
 * Feeds `event` to the attempt stored on row `id` and stores the phase it
 * moves to. A phase that does not change is not written, so a late poll or
 * the timeout after the attempt ended leaves the row as it is. Null when the
 * row is gone or holds no attempt.
 */
async function advanceAttempt(
	ctx: MutationCtx,
	chain: AttemptChain,
	event: ActuationEvent
): Promise<{
	phase: ActuationState["phase"];
	requestedAt: number;
	slot: LockSlot;
} | null> {
	const row = await ctx.db.get(chain.id);
	if (
		row?.actuation === undefined ||
		row.requestedAt === undefined ||
		row.slot === undefined
	)
		return null;
	const state = attemptState(
		{
			actuation: row.actuation,
			requestedAt: row.requestedAt,
			actuatedAt: row.actuatedAt,
		},
		chain.action,
		chain.positionBefore
	);
	const next = transition(state, event);
	const stored = storedAttempt(next);
	if (next.phase !== state.phase && stored)
		await ctx.db.patch(chain.id, {
			actuation: stored.actuation,
			actuatedAt: stored.actuatedAt,
		});
	return { phase: next.phase, requestedAt: row.requestedAt, slot: row.slot };
}

/**
 * One poll's reading of the door, fed to its attempt. While the attempt is
 * still `accepted` and the window has room for another poll, schedules the
 * next one; once the row has left `accepted` the chain ends here.
 */
export const applyActuationReading = internalMutation({
	args: { ...attemptChain.fields, position: doorPosition, at: v.number() },
	handler: async (ctx, args): Promise<null> => {
		const { position, at, ...chain } = args;
		const after = await advanceAttempt(ctx, chain, {
			type: "POSITION",
			position,
			at,
		});
		if (
			after?.phase === "accepted" &&
			at + CONFIRM_POLL_MS < after.requestedAt + CONFIRM_WINDOW_MS
		)
			await ctx.scheduler.runAfter(
				CONFIRM_POLL_MS,
				internal.doorActions.pollActuation,
				{ ...chain, slot: after.slot }
			);
		return null;
	},
});

/**
 * The end of an attempt's window: an attempt the door never reacted to
 * becomes `unconfirmed`. Scheduled when the row is written and never
 * cancelled, so it also lands on attempts that already ended, and leaves
 * them alone.
 */
export const actuationTimeout = internalMutation({
	args: attemptChain.fields,
	handler: async (ctx, args): Promise<null> => {
		await advanceAttempt(ctx, args, { type: "TIMEOUT" });
		return null;
	},
});

/** One attempt as the Doors card follows it. */
export type DoorAttemptView = StoredAttempt & { durationMs: number };

/**
 * The caller's own app door attempt, live, for the Doors card. Null, never an
 * error, for a row that is not the caller's or holds no attempt, so the query
 * cannot be used to probe for row ids. It does not check `doorOpensFor`:
 * someone whose access lapses mid-attempt still sees how their own attempt
 * ended. The board's log queries stay board-only.
 */
export const attempt = query({
	args: { id: v.id("doorLog") },
	handler: async (ctx, { id }): Promise<DoorAttemptView | null> => {
		const email = (await ctx.auth.getUserIdentity())?.email;
		if (!email) return null;
		const person = await personByEmail(ctx, email);
		const row = await ctx.db.get(id);
		if (
			!person ||
			row?.personId !== person._id ||
			row.actuation === undefined ||
			row.requestedAt === undefined ||
			row.durationMs === undefined
		)
			return null;
		return {
			actuation: row.actuation,
			durationMs: row.durationMs,
			requestedAt: row.requestedAt,
			actuatedAt: row.actuatedAt,
		};
	},
});
