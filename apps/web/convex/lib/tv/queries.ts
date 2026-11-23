import type { QueryCtx } from "../../_generated/server";

import {
	TV_DEFAULT_TRANSITION,
	TV_INITIAL_VERSION,
	TV_LIMITS,
} from "./constants.ts";

type Database = QueryCtx["db"];

/**
 * Non-revoked TVs. The filter is in the query: revoked rows must not push
 * live ones out of the window.
 */
export function liveDevices(database: Database) {
	return database
		.query("tvDevices")
		.filter((range) => range.eq(range.field("revokedAt"), undefined))
		.take(TV_LIMITS.maxDevices);
}

/** Pairings that have not expired yet, capped at the most an anonymous flood may hold. */
export function livePairings(database: Database, now: number) {
	return database
		.query("tvPairings")
		.withIndex("by_expiresAt", (range) => range.gt("expiresAt", now))
		.take(TV_LIMITS.maxLivePairings);
}

/** The slideshow settings, or the defaults before the config row exists. */
export async function readTvConfig(database: Database) {
	const config = await database.query("tvConfig").first();
	return {
		transition: config?.transition ?? TV_DEFAULT_TRANSITION,
		version: config?.version ?? TV_INITIAL_VERSION,
	};
}

/**
 * Slides in show order. `createSlide` refuses at `maxSlides`, so the table
 * never holds more; reading one extra row makes an overshoot visible (a
 * create-time count check, a listing) instead of silently truncating it.
 */
export function slidesInOrder(database: Database) {
	return database
		.query("tvSlides")
		.withIndex("by_position")
		.take(TV_LIMITS.maxSlides + 1);
}
