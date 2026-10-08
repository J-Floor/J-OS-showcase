import { describe, expect, it } from "vitest";

import {
	FAKE_ACTION_DURATION_MS,
	FAKE_SLOT_LOCK_IDS,
	FakeDoorProvider,
} from "./fakeDoorProvider.ts";

function base() {
	return {
		identities: [
			{
				providerUserId: "u1",
				email: "a@example.com",
			},
		],
		locks: [
			{ lockId: "lock-downstairs", name: "DN" },
			{ lockId: "lock-upstairs", name: "UP" },
		],
	};
}

describe("FakeDoorProvider", () => {
	it("carries authIds set on a fixture identity through readModel", async () => {
		// The revoke paths read identity.authIds off the model; the fake must
		// return whatever a fixture puts there verbatim (no logic of its own).
		const p = new FakeDoorProvider({
			...base(),
			identities: [
				{
					providerUserId: "u1",
					email: "a@example.com",
					authIds: [
						{ lockId: "lock-downstairs", authId: "a1" },
						{ lockId: "lock-upstairs", authId: "a2" },
					],
				},
			],
		});
		const model = await p.readModel();
		expect(model.identities[0].authIds).toEqual([
			{ lockId: "lock-downstairs", authId: "a1" },
			{ lockId: "lock-upstairs", authId: "a2" },
		]);
	});
});

describe("FakeDoorProvider.actuate", () => {
	it("records only locks it actually actuated", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: FAKE_SLOT_LOCK_IDS.upstairs, name: "Upstairs" },
				{ lockId: FAKE_SLOT_LOCK_IDS.downstairs, name: "Downstairs" },
			],
		});
		fake.offline.add(FAKE_SLOT_LOCK_IDS.downstairs);
		expect(await fake.actuate("upstairs", "unlock")).toEqual({
			status: "ok",
			lockName: "Upstairs",
			durationMs: FAKE_ACTION_DURATION_MS,
			positionBefore: "unknown",
		});
		expect(await fake.actuate("downstairs", "unlock")).toEqual({
			status: "offline",
			lockName: "Downstairs",
		});
		expect(fake.calls.actuations).toEqual([["upstairs", "unlock"]]);
	});
});

describe("FakeDoorProvider.revokeAuthIds", () => {
	it("removes a revoked auth from the identities", async () => {
		const p = new FakeDoorProvider({
			...base(),
			identities: [
				{
					providerUserId: "u1",
					email: "a@example.com",
					authIds: [
						{ lockId: "lock-downstairs", authId: "a1" },
						{ lockId: "lock-upstairs", authId: "a2" },
					],
				},
			],
		});
		await p.revokeAuthIds(["a1"]);
		const model = await p.readModel();
		expect(model.identities[0].authIds).toEqual([
			{ lockId: "lock-upstairs", authId: "a2" },
		]);
		expect(p.calls.revokes).toEqual([["a1"]]);
	});
});

describe("FakeDoorProvider.actuate (lock)", () => {
	it("records the action alongside the lock, online locks only", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: FAKE_SLOT_LOCK_IDS.upstairs, name: "Upstairs" },
				{ lockId: FAKE_SLOT_LOCK_IDS.downstairs, name: "Downstairs" },
			],
		});
		fake.offline.add(FAKE_SLOT_LOCK_IDS.downstairs);
		await fake.actuate("upstairs", "unlock");
		expect(await fake.actuate("upstairs", "lock")).toEqual({
			status: "ok",
			lockName: "Upstairs",
			durationMs: FAKE_ACTION_DURATION_MS,
			positionBefore: "unknown",
		});
		expect(await fake.actuate("downstairs", "lock")).toEqual({
			status: "offline",
			lockName: "Downstairs",
		});
		expect(fake.calls.actuations).toEqual([
			["upstairs", "unlock"],
			["upstairs", "lock"],
		]);
	});
});

describe("FakeDoorProvider.readLockStatus", () => {
	it("reports every model lock, offline ones as unreachable, and counts reads", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: FAKE_SLOT_LOCK_IDS.upstairs, name: "Upstairs" },
				{ lockId: FAKE_SLOT_LOCK_IDS.downstairs, name: "Downstairs" },
			],
		});
		fake.offline.add(FAKE_SLOT_LOCK_IDS.downstairs);
		expect(await fake.readLockStatus()).toEqual([
			{
				lockId: FAKE_SLOT_LOCK_IDS.upstairs,
				name: "Upstairs",
				online: true,
				serverState: 0,
			},
			{
				lockId: FAKE_SLOT_LOCK_IDS.downstairs,
				name: "Downstairs",
				online: false,
				serverState: 1,
			},
		]);
		expect(fake.calls.lockStatusReads).toBe(1);
	});
});

describe("FakeDoorProvider.position", () => {
	it("reports the position set per door, unknown by default, and records reads", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [],
		});
		expect(await fake.position("upstairs")).toBe("unknown");
		fake.setPosition("upstairs", "locked");
		expect(await fake.position("upstairs")).toBe("locked");
		expect(await fake.position("downstairs")).toBe("unknown");
		expect(fake.calls.positions).toEqual([
			"upstairs",
			"upstairs",
			"downstairs",
		]);
	});

	it("reads offline for a slot whose lock is marked offline", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [],
		});
		fake.setPosition("upstairs", "locked");
		fake.offline.add(FAKE_SLOT_LOCK_IDS.upstairs);
		expect(await fake.position("upstairs")).toBe("offline");
		expect(await fake.position("downstairs")).toBe("unknown");
	});
});

describe("FakeDoorProvider.queuePositions", () => {
	it("hands out the queued readings in order, then repeats the last", async () => {
		const fake = new FakeDoorProvider({ identities: [], locks: [] });
		fake.queuePositions("downstairs", ["locked", "unlocking", "unlocked"]);
		expect([
			await fake.position("downstairs"),
			await fake.position("downstairs"),
			await fake.position("downstairs"),
			await fake.position("downstairs"),
		]).toEqual(["locked", "unlocking", "unlocked", "unlocked"]);
	});

	it("reports the next reading as the position before an actuation, without using it up", async () => {
		const fake = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: FAKE_SLOT_LOCK_IDS.downstairs, name: "Downstairs" },
			],
		});
		fake.queuePositions("downstairs", ["locked", "unlocking"]);
		expect(await fake.actuate("downstairs", "unlock")).toEqual({
			status: "ok",
			lockName: "Downstairs",
			durationMs: FAKE_ACTION_DURATION_MS,
			positionBefore: "locked",
		});
		expect(await fake.position("downstairs")).toBe("locked");
		expect(await fake.position("downstairs")).toBe("unlocking");
	});

	it("reads offline for an offline lock without using up a reading", async () => {
		const fake = new FakeDoorProvider({ identities: [], locks: [] });
		fake.queuePositions("downstairs", ["locked", "unlocking"]);
		fake.offline.add(FAKE_SLOT_LOCK_IDS.downstairs);
		expect(await fake.position("downstairs")).toBe("offline");
		fake.offline.delete(FAKE_SLOT_LOCK_IDS.downstairs);
		expect(await fake.position("downstairs")).toBe("locked");
	});
});
