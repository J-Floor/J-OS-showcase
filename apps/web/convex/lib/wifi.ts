import { ConvexError } from "convex/values";

import type { DatabaseReader } from "../_generated/server";

/** The space Wi-Fi credentials shape, shared by every reader/return type. */
export type Wifi = { ssid: string; password: string };

/**
 * The current space Wi-Fi credentials: the board-edited `wifiConfig`
 * singleton. Server-only — never imported by the frontend bundle. Reaches the
 * client only through the gated `wifi.get` query or a confirmed visitor's
 * `confirmVisitor` result. There is no fallback: a deployment with no row
 * has no Wi-Fi to hand out until the board sets it (or the dev seed runs).
 */
export async function readWifi(db: DatabaseReader): Promise<Wifi> {
	const row = await db.query("wifiConfig").first();
	if (!row) throw new ConvexError("Wi-Fi not configured");
	return { ssid: row.ssid, password: row.password };
}
