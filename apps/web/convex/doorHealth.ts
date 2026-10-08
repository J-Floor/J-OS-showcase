// The door-health read (is every configured lock reachable through the door
// provider right now?) with its short-lived cache, for the board's
// Diagnostics tab.
//
// No "use node": the door provider is a pure fetch client and actions may
// fetch in the default Convex runtime.
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { type LockStatus } from "./lib/doorProvider.ts";
import { doorProvider } from "./lib/doorProviderEnv.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";

/**
 * Board gate for {@link doorHealth}, which runs as an action and so has no
 * `ctx.db` of its own to check the caller against.
 *
 * Lock health used to be member-facing building status on the Access tab; it
 * now lives on the board-only Diagnostics tab. The bar is
 * `BOARD_LEVEL`.
 */
export const callerHasAccess = internalQuery({
	args: {},
	handler: async (ctx): Promise<boolean> => {
		try {
			await requireRole(ctx, BOARD_LEVEL);
			return true;
		} catch {
			return false;
		}
	},
});

/** A lock the provider cannot reach right now. */
type UnavailableLock = Pick<LockStatus, "lockId" | "name" | "serverState">;

/**
 * Whether every configured lock is one the door provider can reach right now.
 *
 * Read by the Space page's Diagnostics tab. An unreachable lock is also one
 * the app cannot open.
 */
type DoorHealthResult = {
	configured: number;
	unavailable: UnavailableLock[];
	locks: LockStatus[];
};

/** How long a door-health reading is served from cache before the provider is
 *  asked again. Half the Diagnostics card's one-minute poll, so a reading on
 *  screen is at most ~90 seconds old, while the provider still gets at most
 *  ~two reads a minute however many board members have the tab open — which
 *  keeps it from rate-limiting (429). */
const HEALTH_TTL_MS = 30_000;

const HEALTH_CACHE_KEY = "doors";

/** The cached reading, but only if it is newer than `freshSince`; else null so
 *  the action knows to refetch. */
export const readDoorHealthCache = internalQuery({
	args: { freshSince: v.number() },
	handler: async (ctx, { freshSince }): Promise<DoorHealthResult | null> => {
		const row = await ctx.db
			.query("doorHealthCache")
			.withIndex("by_key", (q) => q.eq("key", HEALTH_CACHE_KEY))
			.unique();
		if (!row || row.checkedAt < freshSince || row.locks === undefined)
			return null;
		return {
			configured: row.configured,
			unavailable: row.unavailable,
			locks: row.locks,
		};
	},
});

/** Upsert the single cached reading. */
export const writeDoorHealthCache = internalMutation({
	args: {
		configured: v.number(),
		unavailable: v.array(
			v.object({
				lockId: v.string(),
				name: v.string(),
				serverState: v.number(),
			})
		),
		locks: v.array(
			v.object({
				lockId: v.string(),
				name: v.string(),
				online: v.boolean(),
				serverState: v.number(),
			})
		),
		checkedAt: v.number(),
	},
	handler: async (ctx, args): Promise<void> => {
		const row = await ctx.db
			.query("doorHealthCache")
			.withIndex("by_key", (q) => q.eq("key", HEALTH_CACHE_KEY))
			.unique();
		if (row) await ctx.db.patch(row._id, args);
		else
			await ctx.db.insert("doorHealthCache", {
				key: HEALTH_CACHE_KEY,
				...args,
			});
	},
});

export const doorHealth = action({
	args: {},
	handler: async (ctx): Promise<DoorHealthResult> => {
		if (!(await ctx.runQuery(internal.doorHealth.callerHasAccess, {})))
			throw new Error("Forbidden");
		// Serve a recent reading rather than fanning a live provider round-trip out
		// per viewer per poll — see the TTL note and the cache table.
		const cached = await ctx.runQuery(
			internal.doorHealth.readDoorHealthCache,
			{ freshSince: Date.now() - HEALTH_TTL_MS }
		);
		if (cached) return cached;
		const provider = doorProvider({ requireWrites: false });
		const locks = await provider.readLockStatus();
		const result: DoorHealthResult = {
			configured: locks.length,
			unavailable: locks
				.filter((l) => !l.online)
				.map((l) => ({
					lockId: l.lockId,
					name: l.name,
					serverState: l.serverState,
				})),
			locks,
		};
		await ctx.runMutation(internal.doorHealth.writeDoorHealthCache, {
			...result,
			checkedAt: Date.now(),
		});
		return result;
	},
});
