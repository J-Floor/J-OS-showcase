import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { NOT_CONFIGURED_TEXT } from "./doorCopy.ts";
import { fetchPresenceToken } from "./presence.ts";

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

test("503 is 'not set up', not off-site", async () => {
	vi.mocked(fetch).mockResolvedValue(
		new Response(JSON.stringify({ error: "not-configured" }), {
			status: 503,
		})
	);
	const result = await fetchPresenceToken("fallback");
	expect(result._unsafeUnwrapErr()).toEqual({
		code: "DoorNotConfigured",
		message: NOT_CONFIGURED_TEXT,
	});
});

test.each([
	["another body", JSON.stringify({ error: "overloaded" })],
	["no body", ""],
])("a 503 with %s is the generic failure", async (_name, body) => {
	vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 503 }));
	const result = await fetchPresenceToken("fallback");
	expect(result._unsafeUnwrapErr()).toEqual({
		code: "PresenceCheckFailed",
		message: "fallback",
	});
});

test("403 stays off-site (ok(null))", async () => {
	vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 403 }));
	const result = await fetchPresenceToken("fallback");
	expect(result._unsafeUnwrap()).toBeNull();
});
