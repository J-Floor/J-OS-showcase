import { describe, expect, it } from "vitest";

import { parseAssetTag } from "./assetTag.ts";

describe("parseAssetTag", () => {
	it("accepts one uppercase letter followed by five digits", () => {
		expect(parseAssetTag("A00000")).toBe("A00000");
		expect(parseAssetTag("Z99999")).toBe("Z99999");
	});

	it("trims surrounding whitespace and uppercases the letter", () => {
		expect(parseAssetTag(" a00001 ")).toBe("A00001");
	});

	it("rejects the wrong shape", () => {
		expect(() => parseAssetTag("A0000")).toThrow(/A00000/);
		expect(() => parseAssetTag("AA0000")).toThrow(/A00000/);
		expect(() => parseAssetTag("000000")).toThrow(/A00000/);
		expect(() => parseAssetTag("A0000A")).toThrow(/A00000/);
		expect(() => parseAssetTag("")).toThrow(/A00000/);
	});
});
