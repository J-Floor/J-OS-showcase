import { v } from "convex/values";

import type { DatabaseReader } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { TV_LIMITS, TV_PATHS } from "./lib/tv/constants.ts";
import {
	liveDevices,
	livePairings,
	readTvConfig,
	slidesInOrder,
} from "./lib/tv/queries.ts";

const SWEEP_BATCH = 50;

/**
 * Register a pairing a TV just started: sweeps up to 50 expired rows, then
 * refuses (false) when the live rows are at the cap so an anonymous flood
 * cannot grow the table. Internal: only the HTTP route calls it.
 */
export const startPairing = internalMutation({
	args: {
		codeHash: v.string(),
		pollSecretHash: v.string(),
		now: v.number(),
	},
	handler: async (context, args): Promise<boolean> => {
		const expired = await context.db
			.query("tvPairings")
			.withIndex("by_expiresAt", (range) =>
				range.lt("expiresAt", args.now)
			)
			.take(SWEEP_BATCH);
		for (const row of expired) await context.db.delete(row._id);
		const live = await livePairings(context.db, args.now);
		if (live.length >= TV_LIMITS.maxLivePairings) return false;
		await context.db.insert("tvPairings", {
			codeHash: args.codeHash,
			pollSecretHash: args.pollSecretHash,
			expiresAt: args.now + TV_LIMITS.pairingTtlMs,
		});
		return true;
	},
});

/**
 * The TV's poll. When a board member has approved the pairing and the token
 * has not been handed out yet, creates the device (storing only the token's
 * hash) and returns "claimed". A spent row answers "unknown" forever, so a
 * token is never delivered twice.
 */
export const claimPairing = internalMutation({
	args: {
		pollSecretHash: v.string(),
		tokenHash: v.string(),
		now: v.number(),
	},
	handler: async (
		context,
		args
	): Promise<"pending" | "claimed" | "unknown" | "expired"> => {
		const row = await context.db
			.query("tvPairings")
			.withIndex("by_pollSecretHash", (range) =>
				range.eq("pollSecretHash", args.pollSecretHash)
			)
			.first();
		if (!row || row.deviceId !== undefined) return "unknown";
		if (row.expiresAt <= args.now) {
			await context.db.delete(row._id);
			return "expired";
		}
		if (row.approved !== true) return "pending";
		// Never insert past the cap, whatever was approved meanwhile.
		const active = await liveDevices(context.db);
		if (active.length >= TV_LIMITS.maxDevices) {
			await context.db.delete(row._id);
			return "unknown";
		}
		const deviceId = await context.db.insert("tvDevices", {
			tokenHash: args.tokenHash,
			label: row.label ?? "TV",
			createdAt: args.now,
		});
		await context.db.patch(row._id, { deviceId });
		return "claimed";
	},
});

/**
 * True only for an existing, non-revoked device. Refreshes `lastSeenAt` at
 * most once per `touchIntervalMs`, so a polling TV does not write every call.
 */
export const authenticateDevice = internalMutation({
	args: { tokenHash: v.string(), now: v.number() },
	handler: async (context, args): Promise<boolean> => {
		const device = await context.db
			.query("tvDevices")
			.withIndex("by_tokenHash", (range) =>
				range.eq("tokenHash", args.tokenHash)
			)
			.first();
		if (!device || device.revokedAt !== undefined) return false;
		if (
			device.lastSeenAt === undefined ||
			args.now - device.lastSeenAt >= TV_LIMITS.touchIntervalMs
		)
			await context.db.patch(device._id, { lastSeenAt: args.now });
		return true;
	},
});

/**
 * The built pack's blob id and the `packVersion` that matches that file, or
 * null before the first build or when the blob is gone (one `_storage` point
 * read), so a version is never advertised without a zip behind it.
 */
async function builtPack(database: DatabaseReader) {
	const config = await database.query("tvConfig").first();
	if (config?.packFileId === undefined || config.packVersion === undefined)
		return null;
	const stored = await database.system.get("_storage", config.packFileId);
	return stored === null
		? null
		: { fileId: config.packFileId, version: config.packVersion };
}

/** What a TV plays: enabled slides in order, plus the config version. */
export const manifest = internalQuery({
	args: {},
	handler: async (context) => {
		const { transition, version } = await readTvConfig(context.db);
		// Advertise a version only while its zip exists, so a TV keeps playing the last pack.
		const built = await builtPack(context.db);
		const rows = await slidesInOrder(context.db);
		return {
			version,
			transition,
			packVersion: built === null ? null : built.version,
			slides: rows
				.filter((row) => row.enabled)
				.map((row) => ({
					id: row._id,
					kind: row.kind,
					durationSec: row.durationSec,
					rev: row.updatedAt,
					src: `${TV_PATHS.slide}?id=${row._id}`,
				})),
		};
	},
});

/** One slide's payload, or null for a garbage id, another table's id, or a disabled/incomplete slide. */
export const slideContent = internalQuery({
	args: { id: v.string() },
	handler: async (context, args) => {
		const id = context.db.normalizeId("tvSlides", args.id);
		if (id === null) return null;
		const row = await context.db.get(id);
		if (!row?.enabled) return null;
		if (row.kind === "html")
			return row.htmlText === undefined
				? null
				: { kind: "html" as const, htmlText: row.htmlText };
		return row.fileId === undefined
			? null
			: { kind: "image" as const, fileId: row.fileId };
	},
});

/** The built pack's blob and version, or null while there is none. */
export const packFile = internalQuery({
	args: {},
	handler: (context) => builtPack(context.db),
});
