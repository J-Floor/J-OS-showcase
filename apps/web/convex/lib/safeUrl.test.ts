import { describe, expect, it } from "vitest";

import { normalizeHttpUrl, parseSafeLinks } from "./safeUrl.ts";

describe("normalizeHttpUrl", () => {
	it("prepends https:// when there is no scheme", () => {
		expect(normalizeHttpUrl("linkedin.com/in/ada")).toBe(
			"https://linkedin.com/in/ada"
		);
		expect(normalizeHttpUrl("  example.com ")).toBe("https://example.com/");
	});
	it("keeps http and https", () => {
		expect(normalizeHttpUrl("http://example.com/x")).toBe(
			"http://example.com/x"
		);
		expect(normalizeHttpUrl("https://example.com/x?y=1")).toBe(
			"https://example.com/x?y=1"
		);
	});
	it("rejects every other scheme and garbage", () => {
		for (const bad of [
			"javascript:alert(1)",
			"data:text/html,hi",
			"blob:x",
			"mailto:a@b.c",
			"ht tp://x",
			"",
		]) {
			expect(normalizeHttpUrl(bad)).toBeNull();
		}
	});
});

describe("parseSafeLinks", () => {
	it("returns the normalized links", () => {
		const result = parseSafeLinks([{ label: "", url: "example.com" }]);
		expect(result.isOk() && result.value).toEqual([
			{ label: "", url: "https://example.com/" },
		]);
	});
	it("refuses a non-http link", () => {
		const result = parseSafeLinks([
			{ label: "x", url: "javascript:alert(1)" },
		]);
		expect(result.isErr() && result.error.type).toBe("LinkNotHttp");
	});
	it("refuses more than the maximum number of links", () => {
		const result = parseSafeLinks(
			Array.from({ length: 5 }, () => ({
				label: "",
				url: "https://a.b",
			}))
		);
		expect(result.isErr() && result.error.type).toBe("TooManyLinks");
	});
	it("refuses an over-long url or label", () => {
		const longUrl = parseSafeLinks([
			{ label: "", url: `https://a.b/${"x".repeat(2000)}` },
		]);
		expect(longUrl.isErr() && longUrl.error.type).toBe("LinkTooLong");
		const longLabel = parseSafeLinks([
			{ label: "x".repeat(201), url: "https://a.b" },
		]);
		expect(longLabel.isErr() && longLabel.error.type).toBe("LinkTooLong");
	});
});
