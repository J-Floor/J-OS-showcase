import { expect, test } from "vitest";

import { FakeOccupancyProvider } from "../fakeOccupancyProvider.ts";

import { readWebhook, secretMatches } from "./webhook.ts";

const SECRET = "s3cret-for-tests";

function post(authorization?: string, body = "{}") {
	return new Request("https://example.com/occupancy/webhook", {
		method: "POST",
		body,
		headers: authorization ? { authorization } : {},
	});
}

test("secretMatches: equal only, never with an unset secret", async () => {
	expect(await secretMatches(SECRET, SECRET)).toBe(true);
	expect(await secretMatches("nope", SECRET)).toBe(false);
	expect(await secretMatches(null, SECRET)).toBe(false);
	expect(await secretMatches("", undefined)).toBe(false);
});

test("404 when the provider has no webhook side", async () => {
	const provider = new FakeOccupancyProvider({ count: 1 });
	expect(
		await readWebhook(post(`Bearer ${SECRET}`), {
			provider,
			secret: SECRET,
		})
	).toEqual({ status: 404 });
	expect(
		await readWebhook(post(`Bearer ${SECRET}`), {
			provider: null,
			secret: SECRET,
		})
	).toEqual({ status: 404 });
});

test("401 on a missing or wrong secret", async () => {
	const provider = new FakeOccupancyProvider({ updates: [] });
	expect(await readWebhook(post(), { provider, secret: SECRET })).toEqual({
		status: 401,
	});
	expect(
		await readWebhook(post("Bearer wrong"), { provider, secret: SECRET })
	).toEqual({ status: 401 });
	expect(
		await readWebhook(post(`Bearer ${SECRET}`), {
			provider,
			secret: undefined,
		})
	).toEqual({ status: 401 });
	expect(
		await readWebhook(post("Bearer "), { provider, secret: SECRET })
	).toEqual({ status: 401 });
	expect(
		await readWebhook(post(`bearer ${SECRET}`), {
			provider,
			secret: SECRET,
		})
	).toEqual({ status: 401 });
	expect(provider.calls.bodies).toEqual([]);
});

test("400 when the adapter cannot read the body", async () => {
	const provider = new FakeOccupancyProvider({ updates: [] });
	provider.failure = { type: "OccupancyWebhookInvalid", detail: "bad json" };
	expect(
		await readWebhook(post(`Bearer ${SECRET}`), {
			provider,
			secret: SECRET,
		})
	).toEqual({ status: 400 });
});

test("200 hands the parsed updates back and the adapter sees the raw body", async () => {
	const provider = new FakeOccupancyProvider({
		updates: [{ type: "delta", change: 1 }],
	});
	expect(
		await readWebhook(post(`Bearer ${SECRET}`, "raw"), {
			provider,
			secret: SECRET,
		})
	).toEqual({ status: 200, updates: [{ type: "delta", change: 1 }] });
	expect(provider.calls.bodies).toEqual(["raw"]);
});
