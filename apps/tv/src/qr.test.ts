import { describe, expect, it } from "vitest";

import { renderQr } from "./qr.ts";

describe("renderQr", () => {
	it("renders an SVG with drawn modules", () => {
		const qr = renderQr("https://app.example.com/tv/pair?code=abcd");
		expect(qr.localName).toBe("svg");
		expect(qr.querySelectorAll("path, rect").length).toBeGreaterThan(0);
	});
});
