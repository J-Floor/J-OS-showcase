import { describe, expect, it } from "vitest";

import { parseAssetTag } from "./assetTag.ts";

describe("parseAssetTag", () => {
	it("accepts one uppercase letter followed by five digits", () => {
		const first = parseAssetTag("A00000");
		expect(first.isOk() && first.value).toBe("A00000");
		const last = parseAssetTag("Z99999");
		expect(last.isOk() && last.value).toBe("Z99999");
	});

	it("trims surrounding whitespace and uppercases the letter", () => {
		const result = parseAssetTag(" a00001 ");
		expect(result.isOk() && result.value).toBe("A00001");
	});

	it.each(["A0000", "AA0000", "000000", "A0000A", ""])(
		"rejects the wrong shape %j",
		(raw) => {
			const result = parseAssetTag(raw);
			expect(result.isErr() && result.error.type).toBe("InvalidAssetTag");
		}
	);
});
