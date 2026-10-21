import { err, ok, type Result } from "neverthrow";

import type { DatabaseReader } from "../_generated/server";

import type { WifiError } from "./errors/wifi.ts";

/** The space Wi-Fi credentials shape, shared by every reader/return type. */
export type Wifi = { ssid: string; password: string };

/**
 * The current space Wi-Fi credentials: the board-edited `wifiConfig`
 * singleton. Server-only — never imported by the frontend bundle. Reaches the
 * client only through the gated `wifi.get` query or a confirmed visitor's
 * `confirmVisitor` result. There is no fallback: a deployment with no row
 * has no Wi-Fi to hand out until the board sets it (or the dev seed runs).
 */
export async function readWifi(
	database: DatabaseReader
): Promise<Result<Wifi, WifiError>> {
	const row = await database.query("wifiConfig").first();
	return row
		? ok({ ssid: row.ssid, password: row.password })
		: err({ type: "WifiNotConfigured" });
}
