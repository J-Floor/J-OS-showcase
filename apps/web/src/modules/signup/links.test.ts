import { describe, expect, it } from "vitest";

import { buildLinks, normalizeUrl } from "./links.ts";

describe("normalizeUrl", () => {
	it("prefixes bare hosts with https and leaves schemes alone", () => {
		expect(normalizeUrl("x.dev")).toBe("https://x.dev");
		expect(normalizeUrl("http://x.dev")).toBe("http://x.dev");
		expect(normalizeUrl("  ")).toBe("");
	});
});

describe("buildLinks", () => {
	it("takes the contiguous filled prefix, empty labels, normalised urls", () => {
		expect(buildLinks(["x.dev", "", "y.dev", ""])).toEqual([
			{ label: "", url: "https://x.dev" },
		]);
		expect(buildLinks(["a.com", "b.com"])).toEqual([
			{ label: "", url: "https://a.com" },
			{ label: "", url: "https://b.com" },
		]);
	});

	it("keeps a label when the same-index url is unchanged", () => {
		const prev = [{ label: "Site", url: "https://a.com" }];
		expect(buildLinks(["a.com"], prev)).toEqual([
			{ label: "Site", url: "https://a.com" },
		]);
		// changed url drops the stale label
		expect(buildLinks(["z.com"], prev)).toEqual([
			{ label: "", url: "https://z.com" },
		]);
	});
});
