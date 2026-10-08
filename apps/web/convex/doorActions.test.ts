import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { CONFIRM_POLL_MS, CONFIRM_WINDOW_MS } from "./lib/doorActuation.ts";
import { mintPresenceToken } from "./lib/doorPresence.ts";
import { setDoorProviderForTests } from "./lib/doorProvider.ts";
import {
	FAKE_ACTION_DURATION_MS,
	FAKE_SLOT_LOCK_IDS,
	FakeDoorProvider,
} from "./lib/fakeDoorProvider.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const EMAIL = "ada@example.com";
// The fake's lock id per slot — `actuate(slot)` resolves to these, so the
// fake's lock set must use them.
const UP = FAKE_SLOT_LOCK_IDS.upstairs;
const DN = FAKE_SLOT_LOCK_IDS.downstairs;
const ANY_ID: unknown = expect.any(String);

describe("unlockDoor", () => {
	const BOARD = "board@example.com";
	const SECRET = "presence-secret";

	beforeEach(() => {
		// Every ok action schedules its attempt's polls; fake timers keep them
		// from running after the test unless a test drives them.
		vi.useFakeTimers();
	});

	afterEach(() => {
		setDoorProviderForTests(undefined);
		vi.unstubAllEnvs();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function fake(online = true) {
		const provider = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: DN, name: "J Floor City - Downstairs" },
				{ lockId: UP, name: "J Floor City - Upstairs" },
			],
		});
		if (!online) for (const id of [DN, UP]) provider.offline.add(id);
		return provider;
	}

	async function setup(tier = "board", extra: Record<string, unknown> = {}) {
		vi.stubEnv("DOOR_PRESENCE_SECRET", SECRET);
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: BOARD,
				firstName: "Bo",
				lastName: "Ard",
				tier,
				stage: "active",
				stageSince: Date.now(),
				...extra,
			} as never);
		});
		return t;
	}

	async function logRows(t: TestConvex<typeof schema>) {
		return t.run(async (ctx) => ctx.db.query("doorLog").collect());
	}

	it("opens the door and logs it", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const requestedAt = Date.now();
		const presence = await mintPresenceToken(SECRET, requestedAt);
		const outcome = await t
			.withIdentity({ email: BOARD })
			.action(api.doorActions.unlockDoor, {
				lock: "downstairs",
				presence,
			});
		expect(provider.calls.actuations).toEqual([["downstairs", "unlock"]]);
		const rows = await logRows(t);
		expect(rows).toHaveLength(1);
		expect(outcome).toEqual({ status: "ok", attemptId: rows[0]._id });
		expect(rows[0]).toMatchObject({
			operation: "unlock",
			trigger: "app",
			outcome: "ok",
			email: BOARD,
			slot: "downstairs",
			lockNames: ["J Floor City - Downstairs"],
			durationMs: FAKE_ACTION_DURATION_MS,
			actuation: "accepted",
			requestedAt,
		});
		// An ok row's `detail` is prose-only and unset — the door is now
		// identified by the structured `slot` field, not by reusing `detail`.
		expect(rows[0]).not.toHaveProperty("detail");
	});

	it.each(["member", "core", "guest"])(
		"opens the door for an active %s — app unlock is for everyone the door is open for",
		async (tier) => {
			const t = await setup(tier);
			const provider = fake();
			setDoorProviderForTests(provider);
			const presence = await mintPresenceToken(SECRET, Date.now());
			expect(
				await t
					.withIdentity({ email: BOARD })
					.action(api.doorActions.unlockDoor, {
						lock: "downstairs",
						presence,
					})
			).toEqual({ status: "ok", attemptId: ANY_ID });
			expect(provider.calls.actuations).toEqual([
				["downstairs", "unlock"],
			]);
		}
	);

	it("refuses a member the board has shut out (force_off) without actuating", async () => {
		const t = await setup("member", {
			door: { override: "force_off", reason: "under review" },
		});
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence,
				})
		).rejects.toThrow(/not available/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("refuses a guest whose access has expired without actuating", async () => {
		const t = await setup("guest", {
			stage: "expired",
			accessUntil: Date.now() - 1000,
		});
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).rejects.toThrow(/not available/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("refuses a forged presence token without actuating", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken("wrong-secret", Date.now());
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence,
				})
		).rejects.toThrow(/Wi-Fi/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("refuses an expired presence token", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now() - 60_000);
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence,
				})
		).rejects.toThrow(/Wi-Fi/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("refuses when unlock is not configured", async () => {
		const t = await setup();
		vi.stubEnv("DOOR_PRESENCE_SECRET", "");
		setDoorProviderForTests(fake());
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence: "x.y",
				})
		).rejects.toThrow(/not configured/);
	});

	it("reports an offline lock and logs a failure", async () => {
		const t = await setup();
		const provider = fake(false);
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence,
				})
		).toEqual({ status: "offline" });
		expect(provider.calls.actuations).toEqual([]);
		expect((await logRows(t))[0]).toMatchObject({
			operation: "unlock",
			outcome: "failed",
			slot: "upstairs",
			detail: "offline",
			lockNames: ["J Floor City - Upstairs"],
		});
	});

	it("reports a busy lock as busy and logs it as busy, not failed", async () => {
		const t = await setup();
		const provider = fake();
		provider.busyLocks.add(DN);
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).toEqual({ status: "busy" });
		expect(provider.calls.actuations).toEqual([]);
		expect((await logRows(t))[0]).toMatchObject({
			operation: "unlock",
			outcome: "busy",
			slot: "downstairs",
		});
	});

	it("debounces a second tap on the SAME door within the debounce window", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		const as = t.withIdentity({ email: BOARD });
		await as.action(api.doorActions.unlockDoor, {
			lock: "downstairs",
			presence,
		});
		expect(
			await as.action(api.doorActions.unlockDoor, {
				lock: "downstairs",
				presence,
			})
		).toEqual({ status: "debounced" });
		expect(provider.calls.actuations).toEqual([["downstairs", "unlock"]]);
		expect(await logRows(t)).toHaveLength(1);
	});

	async function seedOkRow(
		t: TestConvex<typeof schema>,
		extra: { at: number; durationMs?: number }
	) {
		await t.run(async (ctx) => {
			const person = (await ctx.db.query("people").collect()).find(
				(p) => p.email === BOARD
			);
			await ctx.db.insert("doorLog", {
				trigger: "app",
				email: BOARD,
				name: "Bo Ard",
				personId: person?._id,
				lockNames: ["J Floor City - Downstairs"],
				operation: "unlock",
				outcome: "ok",
				slot: "downstairs",
				...extra,
			});
		});
	}

	it("lets a repeat tap through once the last action's durationMs has passed", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await seedOkRow(t, { at: Date.now() - 4_000, durationMs: 3_000 });
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(provider.calls.actuations).toEqual([["downstairs", "unlock"]]);
	});

	it("still debounces a repeat tap inside the last action's durationMs", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await seedOkRow(t, { at: Date.now() - 2_000, durationMs: 3_000 });
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).toEqual({ status: "debounced" });
		expect(provider.calls.actuations).toEqual([]);
	});

	it("does not debounce after an ok row without a durationMs", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await seedOkRow(t, { at: Date.now() - 1 });
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).toEqual({ status: "ok", attemptId: ANY_ID });
	});

	it("does not debounce a different door within the same window", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		const as = t.withIdentity({ email: BOARD });
		expect(
			await as.action(api.doorActions.unlockDoor, {
				lock: "downstairs",
				presence,
			})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(
			await as.action(api.doorActions.unlockDoor, {
				lock: "upstairs",
				presence,
			})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(provider.calls.actuations).toEqual([
			["downstairs", "unlock"],
			["upstairs", "unlock"],
		]);
		expect(await logRows(t)).toHaveLength(2);
	});

	it("logs a thrown provider failure and rethrows", async () => {
		const t = await setup();
		const provider = fake();
		provider.actuate = () =>
			Promise.reject(new Error("the provider said 503"));
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.unlockDoor, {
					lock: "upstairs",
					presence,
				})
		).rejects.toThrow(/503/);
		expect((await logRows(t))[0]).toMatchObject({
			operation: "unlock",
			outcome: "failed",
			slot: "upstairs",
			detail: "the provider said 503",
			lockNames: ["upstairs"],
		});
	});

	it("lockDoor locks the upstairs door and logs a lock row", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.lockDoor, {
					lock: "upstairs",
					presence,
				})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(provider.calls.actuations).toEqual([["upstairs", "lock"]]);
		const rows = await logRows(t);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			operation: "lock",
			trigger: "app",
			outcome: "ok",
			email: BOARD,
			slot: "upstairs",
			lockNames: ["J Floor City - Upstairs"],
		});
		expect(rows[0]).not.toHaveProperty("detail");
	});

	it("a successful lock or unlock drops the door's cached position, so the next read goes to the provider", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		provider.setPosition("upstairs", "locked");
		const as = t.withIdentity({ email: BOARD });
		await as.action(api.doorActions.doorPosition, { lock: "upstairs" });
		expect(provider.calls.positions).toEqual(["upstairs"]);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await as.action(api.doorActions.unlockDoor, {
			lock: "upstairs",
			presence,
		});
		const rows = await t.run(async (ctx) =>
			ctx.db.query("doorPositionCache").collect()
		);
		expect(rows).toEqual([]);
		provider.setPosition("upstairs", "unlocked");
		expect(
			await as.action(api.doorActions.doorPosition, { lock: "upstairs" })
		).toBe("unlocked");
		expect(provider.calls.positions).toEqual(["upstairs", "upstairs"]);
	});

	it("lockDoor refuses a door that cannot lock (downstairs) before touching the provider", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t.withIdentity({ email: BOARD }).action(api.doorActions.lockDoor, {
				lock: "downstairs",
				presence,
			})
		).rejects.toThrow(/This door locks by itself/);
		expect(provider.calls.actuations).toEqual([]);
		expect(await logRows(t)).toHaveLength(0);
	});

	it("lockDoor refuses a forged presence token without actuating", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken("wrong-secret", Date.now());
		await expect(
			t.withIdentity({ email: BOARD }).action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).rejects.toThrow(/Wi-Fi/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("lockDoor locks upstairs for a member", async () => {
		const t = await setup("member");
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.lockDoor, {
					lock: "upstairs",
					presence,
				})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(provider.calls.actuations).toEqual([["upstairs", "lock"]]);
	});

	it("lockDoor refuses a member the board has shut out (force_off) without actuating", async () => {
		const t = await setup("member", {
			door: { override: "force_off", reason: "under review" },
		});
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t.withIdentity({ email: BOARD }).action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).rejects.toThrow(/not available/);
		expect(provider.calls.actuations).toEqual([]);
	});

	it("lockDoor reports an offline lock and logs a failed lock row", async () => {
		const t = await setup();
		const provider = fake(false);
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.lockDoor, {
					lock: "upstairs",
					presence,
				})
		).toEqual({ status: "offline" });
		expect(provider.calls.actuations).toEqual([]);
		expect((await logRows(t))[0]).toMatchObject({
			operation: "lock",
			outcome: "failed",
			slot: "upstairs",
			detail: "offline",
		});
	});

	it("debounces a repeat LOCK on the same door within the debounce window", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		const as = t.withIdentity({ email: BOARD });
		await as.action(api.doorActions.lockDoor, {
			lock: "upstairs",
			presence,
		});
		expect(
			await as.action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).toEqual({ status: "debounced" });
		expect(provider.calls.actuations).toEqual([["upstairs", "lock"]]);
		expect(await logRows(t)).toHaveLength(1);
	});

	it("does not debounce a lock right after an unlock of the same door", async () => {
		const t = await setup();
		const provider = fake();
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		const as = t.withIdentity({ email: BOARD });
		expect(
			await as.action(api.doorActions.unlockDoor, {
				lock: "upstairs",
				presence,
			})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(
			await as.action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		// And back again: the newest row is now the lock, so an unlock is new.
		expect(
			await as.action(api.doorActions.unlockDoor, {
				lock: "upstairs",
				presence,
			})
		).toEqual({ status: "ok", attemptId: ANY_ID });
		expect(provider.calls.actuations).toEqual([
			["upstairs", "unlock"],
			["upstairs", "lock"],
			["upstairs", "unlock"],
		]);
		expect(await logRows(t)).toHaveLength(3);
	});

	it("lockDoor logs a thrown provider failure as a lock row and rethrows", async () => {
		const t = await setup();
		const provider = fake();
		provider.actuate = () =>
			Promise.reject(new Error("the provider said 503"));
		setDoorProviderForTests(provider);
		const presence = await mintPresenceToken(SECRET, Date.now());
		await expect(
			t.withIdentity({ email: BOARD }).action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).rejects.toThrow(/503/);
		expect((await logRows(t))[0]).toMatchObject({
			operation: "lock",
			outcome: "failed",
			slot: "upstairs",
			detail: "the provider said 503",
		});
	});

	/** Runs the scheduled work due in the next `ms`, one `CONFIRM_POLL_MS`
	 *  step at a time, the way test-stubs/runAndCollectLogs.ts drains jobs.
	 *  Never `vi.runAllTimers()`: each poll schedules the next only once its
	 *  mutation commits, so it would fire the timeout first. */
	async function runPolls(t: TestConvex<typeof schema>, ms: number) {
		for (let elapsed = 0; elapsed < ms; elapsed += CONFIRM_POLL_MS) {
			vi.advanceTimersByTime(CONFIRM_POLL_MS);
			await t.finishInProgressScheduledFunctions();
		}
	}

	async function unlock(
		t: TestConvex<typeof schema>,
		lock: "downstairs" | "upstairs"
	) {
		const presence = await mintPresenceToken(SECRET, Date.now());
		return t
			.withIdentity({ email: BOARD })
			.action(api.doorActions.unlockDoor, { lock, presence });
	}

	async function scheduledJobs(t: TestConvex<typeof schema>) {
		return t.run(async (ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
	}

	it("confirms an unlock when the door reacts, then stops reading the door", async () => {
		const t = await setup();
		const provider = fake();
		provider.queuePositions("downstairs", [
			"locked",
			"unlocking",
			"unlocked",
		]);
		setDoorProviderForTests(provider);
		const requestedAt = Date.now();
		const outcome = await unlock(t, "downstairs");
		const [accepted] = await logRows(t);
		expect(outcome).toEqual({ status: "ok", attemptId: accepted._id });
		expect(accepted).toMatchObject({ actuation: "accepted", requestedAt });
		await runPolls(t, 2 * CONFIRM_POLL_MS);
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "actuated",
			requestedAt,
			actuatedAt: requestedAt + 2 * CONFIRM_POLL_MS,
		});
		await runPolls(t, CONFIRM_WINDOW_MS);
		expect(provider.calls.positions).toEqual(["downstairs", "downstairs"]);
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "actuated",
			actuatedAt: requestedAt + 2 * CONFIRM_POLL_MS,
		});
	});

	it("marks an unlock unconfirmed when the door never reacts within the window", async () => {
		const t = await setup();
		const provider = fake();
		provider.setPosition("downstairs", "locked");
		setDoorProviderForTests(provider);
		const requestedAt = Date.now();
		await unlock(t, "downstairs");
		await runPolls(t, CONFIRM_WINDOW_MS);
		const [row] = await logRows(t);
		expect(row).toMatchObject({ actuation: "unconfirmed", requestedAt });
		expect(row.actuatedAt).toBeUndefined();
		expect(provider.calls.positions).toHaveLength(
			CONFIRM_WINDOW_MS / CONFIRM_POLL_MS - 1
		);
	});

	it("keeps polling through a failed and an offline read, and confirms a later reaction", async () => {
		const t = await setup();
		const provider = fake();
		provider.queuePositions("downstairs", [
			"locked",
			"offline",
			"unlocking",
		]);
		const read = provider.position.bind(provider);
		let reads = 0;
		provider.position = (slot) => {
			reads += 1;
			return reads === 1
				? Promise.reject(new Error("read failed"))
				: read(slot);
		};
		setDoorProviderForTests(provider);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const requestedAt = Date.now();
		await unlock(t, "downstairs");
		await runPolls(t, 4 * CONFIRM_POLL_MS);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("read failed")
		);
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "actuated",
			actuatedAt: requestedAt + 4 * CONFIRM_POLL_MS,
		});
	});

	it("an unlock sent to a door that already reads unlocked is actuated at once and polls nothing", async () => {
		const t = await setup();
		const provider = fake();
		provider.setPosition("upstairs", "unlocked");
		setDoorProviderForTests(provider);
		const requestedAt = Date.now();
		await unlock(t, "upstairs");
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "actuated",
			requestedAt,
			actuatedAt: requestedAt,
		});
		expect(await scheduledJobs(t)).toEqual([]);
		expect(provider.calls.positions).toEqual([]);
	});

	it("an unlock sent to a door that relocks by itself, still reading unlocked, waits for a reading of its own", async () => {
		const t = await setup();
		const provider = fake();
		provider.queuePositions("downstairs", [
			"unlocked",
			"locked",
			"unlocking",
		]);
		setDoorProviderForTests(provider);
		const requestedAt = Date.now();
		await unlock(t, "downstairs");
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "accepted",
			requestedAt,
		});
		await runPolls(t, 2 * CONFIRM_POLL_MS);
		expect((await logRows(t))[0]).toMatchObject({ actuation: "accepted" });
		await runPolls(t, CONFIRM_POLL_MS);
		expect((await logRows(t))[0]).toMatchObject({
			actuation: "actuated",
			actuatedAt: requestedAt + 3 * CONFIRM_POLL_MS,
		});
	});

	it("an accepted unlock whose attempt row cannot be written still reports ok, with no attempt to follow", async () => {
		const t = await setup();
		const provider = fake();
		const actuate = provider.actuate.bind(provider);
		provider.actuate = async (slot, action) => {
			const result = await actuate(slot, action);
			return result.status === "ok"
				? // An invalid positionBefore deliberately makes the attempt row write fail.
					{ ...result, positionBefore: "jammed" as never }
				: result;
		};
		setDoorProviderForTests(provider);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await unlock(t, "downstairs")).toEqual({
			status: "ok",
			attemptId: null,
		});
		expect(provider.calls.actuations).toEqual([["downstairs", "unlock"]]);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("audit row lost")
		);
		expect(await logRows(t)).toEqual([]);
		expect(await scheduledJobs(t)).toEqual([]);
	});

	const REFUSALS: [string, (provider: FakeDoorProvider) => void][] = [
		[
			"offline",
			(provider) => {
				provider.offline.add(DN);
			},
		],
		[
			"busy",
			(provider) => {
				provider.busyLocks.add(DN);
			},
		],
		[
			"thrown",
			(provider) => {
				provider.actuate = () =>
					Promise.reject(new Error("the provider said 503"));
			},
		],
	];

	it.each(REFUSALS)(
		"a %s refusal's row carries no attempt and schedules nothing",
		async (label, arrange) => {
			const t = await setup();
			const provider = fake();
			arrange(provider);
			setDoorProviderForTests(provider);
			const run = unlock(t, "downstairs");
			await (label === "thrown"
				? expect(run).rejects.toThrow(/503/)
				: expect(run).resolves.toEqual({ status: label }));
			const [row] = await logRows(t);
			expect(row).not.toHaveProperty("actuation");
			expect(row).not.toHaveProperty("requestedAt");
			expect(row).not.toHaveProperty("actuatedAt");
			expect(await scheduledJobs(t)).toEqual([]);
		}
	);
});

describe("doorPosition", () => {
	const BOARD = "board@example.com";

	afterEach(() => {
		setDoorProviderForTests(undefined);
		vi.useRealTimers();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function fake() {
		const provider = new FakeDoorProvider({
			identities: [],
			locks: [
				{ lockId: DN, name: "J Floor City - Downstairs" },
				{ lockId: UP, name: "J Floor City - Upstairs" },
			],
		});
		provider.setPosition("upstairs", "locked");
		setDoorProviderForTests(provider);
		return provider;
	}

	async function setup(fields: Record<string, unknown> = {}) {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: BOARD,
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				...fields,
			} as never);
		});
		return t.withIdentity({ email: BOARD });
	}

	it("refuses the downstairs door, whose position is not shown", async () => {
		const as = await setup();
		const provider = fake();
		await expect(
			as.action(api.doorActions.doorPosition, { lock: "downstairs" })
		).rejects.toThrow(/This door's position is not shown/);
		expect(provider.calls.positions).toEqual([]);
	});

	it("refuses a caller the door does not open for", async () => {
		const as = await setup({
			tier: "member",
			door: { override: "force_off", reason: "under review" },
		});
		const provider = fake();
		await expect(
			as.action(api.doorActions.doorPosition, { lock: "upstairs" })
		).rejects.toThrow(/not available for your account/i);
		expect(provider.calls.positions).toEqual([]);
	});

	it("reads the provider once, then serves the cache within the TTL", async () => {
		const as = await setup();
		const provider = fake();
		expect(
			await as.action(api.doorActions.doorPosition, { lock: "upstairs" })
		).toBe("locked");
		provider.setPosition("upstairs", "unlocked");
		expect(
			await as.action(api.doorActions.doorPosition, { lock: "upstairs" })
		).toBe("locked");
		expect(provider.calls.positions).toEqual(["upstairs"]);
	});

	it("serves the cache for fresh within 5s of the last read", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const as = await setup();
		const provider = fake();
		await as.action(api.doorActions.doorPosition, { lock: "upstairs" });
		vi.setSystemTime(new Date("2026-01-01T00:00:04Z"));
		provider.setPosition("upstairs", "unlocked");
		expect(
			await as.action(api.doorActions.doorPosition, {
				lock: "upstairs",
				fresh: true,
			})
		).toBe("locked");
		expect(provider.calls.positions).toEqual(["upstairs"]);
	});

	it("reads the provider again when fresh is set after 5s", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const as = await setup();
		const provider = fake();
		await as.action(api.doorActions.doorPosition, { lock: "upstairs" });
		vi.setSystemTime(new Date("2026-01-01T00:00:06Z"));
		provider.setPosition("upstairs", "unlocked");
		expect(
			await as.action(api.doorActions.doorPosition, {
				lock: "upstairs",
				fresh: true,
			})
		).toBe("unlocked");
		expect(provider.calls.positions).toEqual(["upstairs", "upstairs"]);
	});

	it("reads the provider again once the cache is older than the TTL", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const as = await setup();
		const provider = fake();
		await as.action(api.doorActions.doorPosition, { lock: "upstairs" });
		vi.setSystemTime(new Date("2026-01-01T00:00:16Z"));
		provider.setPosition("upstairs", "unlocked");
		expect(
			await as.action(api.doorActions.doorPosition, { lock: "upstairs" })
		).toBe("unlocked");
		expect(provider.calls.positions).toEqual(["upstairs", "upstairs"]);
	});

	it("still returns the position when the cache write fails", async () => {
		const provider = fake();
		const t = convexTest(schema, modules);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: BOARD,
				firstName: "Bo",
				lastName: "Ard",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			} as never);
			// Two rows for one slot make the cache upsert's `.unique()` throw.
			for (const checkedAt of [1, 2])
				await ctx.db.insert("doorPositionCache", {
					slot: "upstairs",
					position: "unlocked",
					checkedAt,
				});
		});
		expect(
			await t
				.withIdentity({ email: BOARD })
				.action(api.doorActions.doorPosition, {
					lock: "upstairs",
					fresh: true,
				})
		).toBe("locked");
		expect(provider.calls.positions).toEqual(["upstairs"]);
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("cache write failed")
		);
	});
});

/**
 * A door action writes to the real lock account. With no test provider
 * injected and door writes not opted in (the test process never opts in), it
 * refuses with a readable error and sends nothing. Which setting opts in is
 * the adapter's business, pinned by its own test.
 */
describe("door actions without a test provider while door writes are disabled", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	function recordFetch(): { calls: string[] } {
		const calls: string[] = [];
		vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
			calls.push(`${init?.method ?? "GET"} ${input}`);
			return Promise.reject(
				new Error("the lock provider must not be called")
			);
		});
		return { calls };
	}

	async function boardMember(): Promise<ReturnType<typeof convexTest>> {
		vi.stubEnv("DOOR_PRESENCE_SECRET", "presence-secret");
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			await ctx.db.insert("people", {
				email: EMAIL,
				firstName: "Ada",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
		});
		return t;
	}

	it("unlockDoor refuses and calls the provider not at all", async () => {
		const t = await boardMember();
		const { calls } = recordFetch();
		const presence = await mintPresenceToken("presence-secret", Date.now());
		await expect(
			t
				.withIdentity({ email: EMAIL })
				.action(api.doorActions.unlockDoor, {
					lock: "downstairs",
					presence,
				})
		).rejects.toThrow(/Door writes are disabled on this deployment/);
		expect(calls).toEqual([]);
	});

	it("lockDoor refuses and calls the provider not at all", async () => {
		const t = await boardMember();
		const { calls } = recordFetch();
		const presence = await mintPresenceToken("presence-secret", Date.now());
		await expect(
			t.withIdentity({ email: EMAIL }).action(api.doorActions.lockDoor, {
				lock: "upstairs",
				presence,
			})
		).rejects.toThrow(/Door writes are disabled on this deployment/);
		expect(calls).toEqual([]);
	});
});

describe("pollActuation", () => {
	const T0 = Date.UTC(2026, 9, 8, 12, 0);

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(T0);
	});

	afterEach(() => {
		setDoorProviderForTests(undefined);
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	async function acceptedAttempt() {
		const t = convexTest(schema, modules);
		const id = await t.run(async (ctx) => {
			const personId = await ctx.db.insert("people", {
				email: EMAIL,
				firstName: "Ada",
				lastName: "",
				tier: "board",
				stage: "active",
				stageSince: T0,
			});
			return ctx.db.insert("doorLog", {
				at: T0,
				operation: "unlock",
				trigger: "app",
				personId,
				actorId: personId,
				email: EMAIL,
				name: "Ada",
				lockNames: ["J Floor City - Downstairs"],
				outcome: "ok",
				slot: "downstairs",
				durationMs: FAKE_ACTION_DURATION_MS,
				actuation: "accepted",
				requestedAt: T0,
			});
		});
		return { t, id };
	}

	function emptyFake() {
		const provider = new FakeDoorProvider({ identities: [], locks: [] });
		setDoorProviderForTests(provider);
		return provider;
	}

	it("reads the door once and marks the attempt actuated when it reacted", async () => {
		const { t, id } = await acceptedAttempt();
		const provider = emptyFake();
		provider.setPosition("downstairs", "unlocking");
		await t.action(internal.doorActions.pollActuation, {
			id,
			slot: "downstairs",
			action: "unlock",
			positionBefore: "locked",
		});
		expect(provider.calls.positions).toEqual(["downstairs"]);
		expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({
			actuation: "actuated",
			actuatedAt: T0,
		});
	});

	it("takes a failed read as no information and polls again", async () => {
		const { t, id } = await acceptedAttempt();
		const provider = emptyFake();
		provider.position = () => Promise.reject(new Error("read failed"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await t.action(internal.doorActions.pollActuation, {
			id,
			slot: "downstairs",
			action: "unlock",
			positionBefore: "locked",
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("read failed")
		);
		expect(await t.run(async (ctx) => ctx.db.get(id))).toMatchObject({
			actuation: "accepted",
		});
		const jobs = await t.run(async (ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs.map((job) => job.name)).toEqual([
			"doorActions:pollActuation",
		]);
	});
});
