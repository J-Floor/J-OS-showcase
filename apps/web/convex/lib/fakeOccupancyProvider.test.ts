import { expect, test } from "vitest";

import { FakeOccupancyProvider } from "./fakeOccupancyProvider.ts";

test("readCount hands out the scripted count and records the read", async () => {
	const fake = new FakeOccupancyProvider({ count: 7 });
	const result = await fake.readCount?.();
	expect(result?._unsafeUnwrap()).toBe(7);
	expect(fake.calls.reads).toBe(1);
});

test("parseWebhook hands out the scripted updates and records the body", () => {
	const fake = new FakeOccupancyProvider({
		updates: [{ type: "delta", change: 1 }],
	});
	const result = fake.parseWebhook?.("{}", new Headers());
	expect(result?._unsafeUnwrap()).toEqual([{ type: "delta", change: 1 }]);
	expect(fake.calls.bodies).toEqual(["{}"]);
});

test("a set failure fails both sides", async () => {
	const fake = new FakeOccupancyProvider({ count: 1, updates: [] });
	fake.failure = { type: "OccupancyProviderFailed", detail: "down" };
	const read = await fake.readCount?.();
	expect(read?.isErr()).toBe(true);
	expect(fake.parseWebhook?.("", new Headers()).isErr()).toBe(true);
});

test("maxSilenceMs is passed through and absent by default", () => {
	expect(
		new FakeOccupancyProvider({ count: 1, maxSilenceMs: 900_000 })
			.maxSilenceMs
	).toBe(900_000);
	expect(
		new FakeOccupancyProvider({ count: 1 }).maxSilenceMs
	).toBeUndefined();
});
