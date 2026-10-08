import { describe, expect, it } from "vitest";

import { extractItemLink } from "./extractItemLink.ts";

describe("extractItemLink", () => {
	it("pulls the asset tag out of a relative scanned deep-link URL", () => {
		expect(extractItemLink("/inventory?tab=items&item=A00001")).toEqual({
			kind: "tag",
			tag: "A00001",
		});
	});

	it("pulls the asset tag out of an absolute scanned deep-link URL", () => {
		expect(
			extractItemLink(
				"https://app.example.com/inventory?tab=items&item=A00001"
			)
		).toEqual({ kind: "tag", tag: "A00001" });
	});

	it("accepts a bare asset tag, trimmed and uppercased", () => {
		expect(extractItemLink(" a00001 ")).toEqual({
			kind: "tag",
			tag: "A00001",
		});
	});

	it("rejects junk that is neither a deep link nor a tag", () => {
		expect(extractItemLink("not-a-tag")).toEqual({ kind: "invalid" });
	});

	it("rejects a URL with no item param", () => {
		expect(extractItemLink("https://example.com")).toEqual({
			kind: "invalid",
		});
	});

	it("rejects a deep link whose item value isn't a real tag", () => {
		expect(extractItemLink("/inventory?tab=items&item=not-a-tag")).toEqual({
			kind: "invalid",
		});
	});
});
