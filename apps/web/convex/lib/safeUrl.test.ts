import { describe, expect, it } from "vitest";

import { assertSafeLinks, normalizeHttpUrl } from "./safeUrl.ts";

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

describe("assertSafeLinks", () => {
	it("returns normalized links and throws on a bad one", () => {
		expect(assertSafeLinks([{ label: "", url: "example.com" }])).toEqual([
			{ label: "", url: "https://example.com/" },
		]);
		expect(() =>
			assertSafeLinks([{ label: "x", url: "javascript:alert(1)" }])
		).toThrow("Links must use http or https.");
		expect(() =>
			assertSafeLinks(
				Array.from({ length: 5 }, () => ({
					label: "",
					url: "https://a.b",
				}))
			)
		).toThrow("Too many links (max 4).");
	});
});
