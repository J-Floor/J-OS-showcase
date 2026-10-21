import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyRecaptchaToken } from "./recaptcha.ts";

function stubFetch(response: () => Promise<Response>) {
	vi.stubGlobal("fetch", vi.fn(response));
}

describe("verifyRecaptchaToken", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("is Ok(true) for a passing verdict on the expected action", async () => {
		stubFetch(() =>
			Promise.resolve(
				Response.json({ success: true, action: "signup", score: 0.9 })
			)
		);
		const result = await verifyRecaptchaToken("secret", "t", "signup");
		expect(result.isOk() && result.value).toBe(true);
	});

	it("is Ok(false) for a low score", async () => {
		stubFetch(() =>
			Promise.resolve(
				Response.json({ success: true, action: "signup", score: 0.1 })
			)
		);
		const result = await verifyRecaptchaToken("secret", "t", "signup");
		expect(result.isOk() && result.value).toBe(false);
	});

	it.each([
		["a network failure", () => Promise.reject(new Error("down"))],
		[
			"a non-2xx response",
			() => Promise.resolve(new Response("", { status: 503 })),
		],
		["a non-JSON body", () => Promise.resolve(new Response("<html>"))],
	])("is Err(RecaptchaUnavailable) on %s", async (_name, response) => {
		stubFetch(response);
		const result = await verifyRecaptchaToken("secret", "t", "signup");
		expect(result.isErr() && result.error.type).toBe(
			"RecaptchaUnavailable"
		);
	});
});
