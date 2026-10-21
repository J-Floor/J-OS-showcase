import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { call } from "./call.ts";

describe("call", () => {
	it("is Ok with the resolved value", async () => {
		const result = await call(Promise.resolve(7), "fallback");
		expect(result.isOk() && result.value).toBe(7);
	});

	it("maps a ConvexError with { code, message } data to that error", async () => {
		const result = await call(
			Promise.reject(
				new ConvexError({
					code: "Forbidden",
					message: "You can't do that.",
				})
			),
			"fallback"
		);
		expect(result.isErr() && result.error).toEqual({
			code: "Forbidden",
			message: "You can't do that.",
		});
	});

	it("falls back for a plain Error, whose text Convex redacts", async () => {
		const result = await call(
			Promise.reject(new Error("boom")),
			"Could not save."
		);
		expect(result.isErr() && result.error).toEqual({
			code: "Unknown",
			message: "Could not save.",
		});
	});

	it("falls back for a ConvexError with other data", async () => {
		const result = await call(
			Promise.reject(new ConvexError("old string data")),
			"Could not save."
		);
		expect(result.isErr() && result.error).toEqual({
			code: "Unknown",
			message: "Could not save.",
		});
	});

	it("falls back for a rejected non-Error value", async () => {
		// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test is a non-Error rejection
		const result = await call(Promise.reject("boom"), "Could not save.");
		expect(result.isErr() && result.error.code).toBe("Unknown");
	});
});
