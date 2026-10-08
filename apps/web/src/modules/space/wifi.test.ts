import { expect, it } from "vitest";

import { wifiQrPayload } from "./wifi.ts";

it("builds a WPA join payload from the given network", () => {
	expect(
		wifiQrPayload({ ssid: "J floor", password: "test-wifi-password" })
	).toBe("WIFI:T:WPA;S:J floor;P:test-wifi-password;;");
});

it("does not need escaping for the current credential characters", () => {
	// `*` and `@` and a space are all literal in a WIFI: payload — no backslash
	// escaping required (none of \ ; , : " appear).
	const payload = wifiQrPayload({
		ssid: "J floor",
		password: "test-wifi-password",
	});
	expect(payload).not.toContain("\\");
});

it("escapes the delimiter characters so an editable credential can't break the QR", () => {
	// Now that board/admin can enter any SSID/passphrase, a value containing a
	// WIFI: delimiter (\ ; , : ") must be backslash-escaped or the reader
	// mis-parses the fields.
	const payload = wifiQrPayload({
		ssid: 'A;B:C,D"E\\F',
		password: "p;a:s,s",
	});
	expect(payload).toBe(
		'WIFI:T:WPA;S:A\\;B\\:C\\,D\\"E\\\\F;P:p\\;a\\:s\\,s;;'
	);
});
