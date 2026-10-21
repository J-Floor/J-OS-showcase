import { v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import { requireRole } from "./lib/authGuard.ts";
import { refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL, COMMUNITY_TIERS } from "./lib/roles.ts";
import { checkLength, SSID_MAX, WIFI_PASSWORD_MAX } from "./lib/validate.ts";
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
	handler: async (context): Promise<{ ssid: string; password: string }> => {
		unwrap(await requireRole(context, COMMUNITY_TIERS));
		return unwrap(await readWifi(context.db));
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
	handler: async (context): Promise<{ ssid: string; password: string }> => {
		return unwrap(await readWifi(context.db));
	},
});

/**
 * Board-only: edit the space Wi-Fi credentials. Upserts the `wifiConfig`
 * singleton — patches the existing row if one exists, else inserts the first
 * one (the first edit creates the row `readWifi` requires).
 */
export const update = mutation({
	args: { ssid: v.string(), password: v.string() },
	handler: async (context, args): Promise<void> => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(checkLength(args.ssid, SSID_MAX));
		unwrap(checkLength(args.password, WIFI_PASSWORD_MAX));
		const ssid = args.ssid.trim();
		if (ssid === "") refuse({ type: "WifiSsidRequired" });
		// Validate the password is non-blank, but store it verbatim: a WPA
		// passphrase may legitimately contain leading/trailing spaces, so
		// trimming what we save could silently break the network.
		const password = args.password;
		if (password.trim() === "") refuse({ type: "WifiPasswordRequired" });

		const existing = await context.db.query("wifiConfig").first();
		if (existing) {
			await context.db.patch(existing._id, { ssid, password });
		} else {
			await context.db.insert("wifiConfig", { ssid, password });
		}
	},
});
