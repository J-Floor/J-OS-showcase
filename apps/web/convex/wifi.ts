import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { assertLen, SSID_MAX, WIFI_PASSWORD_MAX } from "./lib/validate.ts";
import { readWifi } from "./lib/wifi.ts";

/**
 * The space Wi-Fi credentials, for an entitled member with space access. Kept
 * out of the frontend bundle: the password is returned only to a caller who
 * passes the same `COMMUNITY_TIERS` gate as every other credential-bearing query.
 * Sign-up is open (magic link), so a bare identity check is NOT enough — that
 * would hand the password to any email on the internet. Logged-out visitors
 * receive it a different way (the `confirmVisitor` result), never here.
 */
export const get = query({
	args: {},
	handler: async (ctx): Promise<{ ssid: string; password: string }> => {
		await requireRole(ctx, COMMUNITY_TIERS);
		return readWifi(ctx.db);
	},
});

/**
 * Internal-only: the current Wi-Fi credentials, unauthenticated. Called
 * server-to-server from `confirmVisitor` (a Convex `action`, which has no
 * `ctx.db`) after it has already established the visitor's verification —
 * this query does no further gating of its own, since it is never reachable
 * from the client.
 */
export const read = internalQuery({
	args: {},
	handler: async (ctx): Promise<{ ssid: string; password: string }> => {
		return readWifi(ctx.db);
	},
});

/**
 * Board-only: edit the space Wi-Fi credentials. Upserts the `wifiConfig`
 * singleton — patches the existing row if one exists, else inserts the first
 * one (the first edit creates the row `readWifi` requires).
 */
export const update = mutation({
	args: { ssid: v.string(), password: v.string() },
	handler: async (ctx, args): Promise<void> => {
		await requireRole(ctx, BOARD_LEVEL);
		assertLen(args.ssid, SSID_MAX, "SSID");
		assertLen(args.password, WIFI_PASSWORD_MAX, "Password");
		const ssid = args.ssid.trim();
		// Validate the password is non-blank, but store it verbatim: a WPA
		// passphrase may legitimately contain leading/trailing spaces, so
		// trimming what we save could silently break the network.
		const password = args.password;
		if (ssid === "") throw new Error("SSID is required.");
		if (password.trim() === "") throw new Error("Password is required.");

		const existing = await ctx.db.query("wifiConfig").first();
		if (existing) {
			await ctx.db.patch(existing._id, { ssid, password });
		} else {
			await ctx.db.insert("wifiConfig", { ssid, password });
		}
	},
});
