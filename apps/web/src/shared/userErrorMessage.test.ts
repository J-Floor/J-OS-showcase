import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { userErrorMessage } from "./userErrorMessage.ts";

describe("userErrorMessage", () => {
	it("returns a ConvexError's string data", () => {
		expect(
			userErrorMessage(
				new ConvexError("Couldn't open the door."),
				"fallback"
			)
		).toBe("Couldn't open the door.");
	});

	it("falls back for a plain Error (redacted by Convex in production)", () => {
		expect(userErrorMessage(new Error("boom"), "fallback")).toBe(
			"fallback"
		);
	});

	it("falls back for a ConvexError whose data is not a string", () => {
		expect(userErrorMessage(new ConvexError({ code: 1 }), "fallback")).toBe(
			"fallback"
		);
	});

	it("falls back for a non-Error thrown value", () => {
		expect(userErrorMessage("boom", "fallback")).toBe("fallback");
	});
});
