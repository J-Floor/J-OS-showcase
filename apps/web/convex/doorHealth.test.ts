import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { setDoorProviderForTests } from "./lib/doorProvider.ts";
import { FakeDoorProvider } from "./lib/fakeDoorProvider.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("callerHasAccess", () => {
	it("is true for a board member", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		expect(
			await t
				.withIdentity({ email: "board@example.com" })
				.query(internal.doorHealth.callerHasAccess, {})
		).toBe(true);
	});

	it("is false for an entitled member", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "mem@example.com",
				firstName: "Mem",
				lastName: "Ber",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		expect(
			await t
				.withIdentity({ email: "mem@example.com" })
				.query(internal.doorHealth.callerHasAccess, {})
		).toBe(false);
	});

	it("is false for an unauthenticated caller", async () => {
		const t = convexTest(schema, modules);
		expect(await t.query(internal.doorHealth.callerHasAccess, {})).toBe(
			false
		);
	});

	it("is false for a prospect (not an access tier)", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "pro@example.com",
				firstName: "Pro",
				lastName: "Spect",
				tier: "prospect",
				stage: "unverified",
				stageSince: Date.now(),
			});
		});
		expect(
			await t
				.withIdentity({ email: "pro@example.com" })
				.query(internal.doorHealth.callerHasAccess, {})
		).toBe(false);
	});
});

describe("doorHealth caching", () => {
	afterEach(() => {
		setDoorProviderForTests(undefined);
	});

	function twoLocks(): FakeDoorProvider {
		return new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: "lock-downstairs", name: "Downstairs" },
				{ lockId: "lock-upstairs", name: "Upstairs" },
			],
		});
	}

	async function asBoardMember(t: ReturnType<typeof convexTest>) {
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: "board@example.com",
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		return t.withIdentity({ email: "board@example.com" });
	}

	it("serves a second read from cache within the TTL, without asking the provider again", async () => {
		const t = convexTest(schema, modules);
		const provider = twoLocks();
		setDoorProviderForTests(provider);
		const asBoard = await asBoardMember(t);

		const first = await asBoard.action(api.doorHealth.doorHealth, {});
		const second = await asBoard.action(api.doorHealth.doorHealth, {});

		expect(second).toEqual(first);
		expect(provider.calls.lockStatusReads).toBe(1);
	});

	it("asks the provider again once a reading is over 30 seconds old", async () => {
		vi.useFakeTimers();
		try {
			const t = convexTest(schema, modules);
			const provider = twoLocks();
			setDoorProviderForTests(provider);
			const asBoard = await asBoardMember(t);

			await asBoard.action(api.doorHealth.doorHealth, {});
			vi.advanceTimersByTime(31_000);
			await asBoard.action(api.doorHealth.doorHealth, {});

			expect(provider.calls.lockStatusReads).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("lists an unreachable lock as unavailable", async () => {
		const t = convexTest(schema, modules);
		const provider = twoLocks();
		provider.offline.add("lock-upstairs");
		setDoorProviderForTests(provider);
		const asBoard = await asBoardMember(t);

		const health = await asBoard.action(api.doorHealth.doorHealth, {});
		expect(health.configured).toBe(2);
		expect(health.unavailable).toEqual([
			{ lockId: "lock-upstairs", name: "Upstairs", serverState: 1 },
		]);
	});

	it("readDoorHealthCache ignores a reading older than freshSince", async () => {
		const t = convexTest(schema, modules);
		const locks = [
			{
				lockId: "1",
				name: "Downstairs",
				online: true,
				serverState: 0,
			},
			{
				lockId: "2",
				name: "Upstairs",
				online: true,
				serverState: 0,
			},
		];
		await t.run(async (ctx) => {
			await ctx.db.insert("doorHealthCache", {
				key: "doors",
				configured: 2,
				unavailable: [],
				locks,
				checkedAt: 1000,
			});
		});
		expect(
			await t.query(internal.doorHealth.readDoorHealthCache, {
				freshSince: 2000,
			})
		).toBeNull();
		expect(
			await t.query(internal.doorHealth.readDoorHealthCache, {
				freshSince: 500,
			})
		).toEqual({ configured: 2, unavailable: [], locks });
	});

	it("readDoorHealthCache ignores a row that has no locks list", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("doorHealthCache", {
				key: "doors",
				configured: 2,
				unavailable: [],
				checkedAt: Date.now(),
			});
		});
		expect(
			await t.query(internal.doorHealth.readDoorHealthCache, {
				freshSince: 0,
			})
		).toBeNull();
	});
});
