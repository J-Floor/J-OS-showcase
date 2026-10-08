export type WifiNetwork = { ssid: string; password: string };

/**
 * Escape the characters that are special in a `WIFI:` join string. The format
 * is delimited by `;` and `:`, so a credential containing any of `\ ; , : "`
 * must backslash-escape it or the QR reader mis-parses the fields. Harmless for
 * a fixed password with none of these, but board-editable credentials can now
 * contain anything.
 */
function escapeWifiValue(value: string): string {
	return value.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Standard Wi-Fi join string that phone cameras / QR readers understand.
 *
 * The credentials themselves are never shipped in the frontend bundle — they
 * live server-side (`convex/lib/wifi.ts`) and reach the client only through a
 * gated query (`api.wifi.get`) or a confirmed visitor's `confirmVisitor`
 * result. This helper just formats whatever network it is handed.
 */
export function wifiQrPayload(net: WifiNetwork): string {
	return `WIFI:T:WPA;S:${escapeWifiValue(net.ssid)};P:${escapeWifiValue(net.password)};;`;
}
