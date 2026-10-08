import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";

import { resolveScannedTag } from "./resolveScannedTag.ts";

const ITEM_ID = "items:test" as Id<"items">;

describe("resolveScannedTag", () => {
	it("returns invalid when the payload is not an asset tag", async () => {
		const lookup = vi.fn();
		expect(await resolveScannedTag("https://example.com", lookup)).toEqual({
			kind: "invalid",
		});
		expect(lookup).not.toHaveBeenCalled();
	});

	it("returns open when a registered item matches the tag", async () => {
		const lookup = vi.fn().mockResolvedValue({ _id: ITEM_ID });
		expect(await resolveScannedTag(" a00001 ", lookup)).toEqual({
			kind: "open",
			id: ITEM_ID,
			assetTag: "A00001",
		});
		expect(lookup).toHaveBeenCalledWith("A00001");
	});

	it("returns unknown when no item uses that tag", async () => {
		const lookup = vi.fn().mockResolvedValue(null);
		expect(await resolveScannedTag("Z00099", lookup)).toEqual({
			kind: "unknown",
			assetTag: "Z00099",
		});
	});
});
