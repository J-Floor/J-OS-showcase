import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DOOR_LOG_PAGE_SIZE } from "./lib/constants.ts";
import { CONFIRM_POLL_MS, CONFIRM_WINDOW_MS } from "./lib/doorActuation.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

async function insertBoard() {
	const t = convexTest(schema, modules);
	await t.run(async (ctx) =>
		ctx.db.insert("people", {
			email: "board@example.com",
			firstName: "Bo",
			lastName: "Ard",
			tier: "board",
			stage: "active",
			stageSince: Date.now(),
		})
	);
	return t;
}

function logRow(at: number) {
	return {
		at,
		operation: "grant" as const,
		trigger: "cron" as const,
		email: "ada@example.com",
		name: "Ada",
		lockNames: [],
		outcome: "ok" as const,
	};
}

describe("doorLog chunked queries", () => {
	const firstPage = { numItems: DOOR_LOG_PAGE_SIZE, cursor: null };

	it("refuses non-board callers on all three", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		const ada = t.withIdentity({ email: "ada@example.com" });
		await expect(ada.query(api.doorLog.firstPageFloor, {})).rejects.toThrow(
			/Forbidden/
		);
		await expect(
			ada.query(api.doorLog.listSince, { since: null })
		).rejects.toThrow(/Forbidden/);
		await expect(
			ada.query(api.doorLog.listBefore, {
				before: 1,
				paginationOpts: firstPage,
			})
		).rejects.toThrow(/Forbidden/);
	});

	it("splits the log at the floor with no gap or overlap", async () => {
		const t = await insertBoard();
		const total = DOOR_LOG_PAGE_SIZE + 25;
		await t.run(async (ctx) => {
			for (let i = 1; i <= total; i++)
				await ctx.db.insert("doorLog", logRow(i));
		});
		const board = t.withIdentity({ email: "board@example.com" });

		const { since } = await board.query(api.doorLog.firstPageFloor, {});
		expect(since).toBe(total - DOOR_LOG_PAGE_SIZE + 1);

		const head = await board.query(api.doorLog.listSince, { since });
		expect(head).toHaveLength(DOOR_LOG_PAGE_SIZE);
		expect(head.map((r) => r.at)).toEqual(
			Array.from({ length: DOOR_LOG_PAGE_SIZE }, (_, i) => total - i)
		);

		const older = await board.query(api.doorLog.listBefore, {
			before: since!,
			paginationOpts: firstPage,
		});
		expect(older.page).toHaveLength(25);
		expect(older.isDone).toBe(true);

		const ids = [...head, ...older.page].map((r) => r._id);
		expect(new Set(ids).size).toBe(total);
	});

	it("keeps rows tied with the floor in the head only", async () => {
		const t = await insertBoard();
		await t.run(async (ctx) => {
			for (let i = 1; i <= 10; i++)
				await ctx.db.insert("doorLog", logRow(i));
			for (let i = 0; i < 3; i++)
				await ctx.db.insert("doorLog", logRow(500));
			for (let i = 0; i < DOOR_LOG_PAGE_SIZE - 2; i++)
				await ctx.db.insert("doorLog", logRow(1000 + i));
		});
		const board = t.withIdentity({ email: "board@example.com" });

		const { since } = await board.query(api.doorLog.firstPageFloor, {});
		expect(since).toBe(500);
		const head = await board.query(api.doorLog.listSince, { since });
		expect(head.filter((r) => r.at === 500)).toHaveLength(3);
		const older = await board.query(api.doorLog.listBefore, {
			before: since!,
			paginationOpts: firstPage,
		});
		expect(older.page.some((r) => r.at === 500)).toBe(false);
		expect(older.page).toHaveLength(10);
	});

	it("returns a null floor and the whole log when it fits one page", async () => {
		const t = await insertBoard();
		await t.run(async (ctx) => {
			for (let i = 1; i <= DOOR_LOG_PAGE_SIZE; i++)
				await ctx.db.insert("doorLog", logRow(i));
		});
		const board = t.withIdentity({ email: "board@example.com" });

		const { since } = await board.query(api.doorLog.firstPageFloor, {});
		expect(since).toBeNull();
		const rows = await board.query(api.doorLog.listSince, { since });
		expect(rows).toHaveLength(DOOR_LOG_PAGE_SIZE);
	});

	it("shows a row inserted after the floor in the head", async () => {
		const t = await insertBoard();
		await t.run(async (ctx) => {
			for (let i = 1; i <= DOOR_LOG_PAGE_SIZE + 5; i++)
				await ctx.db.insert("doorLog", logRow(i));
		});
		const board = t.withIdentity({ email: "board@example.com" });
		const { since } = await board.query(api.doorLog.firstPageFloor, {});

		await t.run(async (ctx) => ctx.db.insert("doorLog", logRow(9999)));

		const head = await board.query(api.doorLog.listSince, { since });
		expect(head).toHaveLength(DOOR_LOG_PAGE_SIZE + 1);
		expect(head[0]?.at).toBe(9999);
	});

	it("resolves actorName in the head and in older chunks", async () => {
		const t = await insertBoard();
		await t.run(async (ctx) => {
			const board = await ctx.db
				.query("people")
				.withIndex("by_email", (q) =>
					q.eq("email", "board@example.com")
				)
				.unique();
			await ctx.db.insert("doorLog", {
				...logRow(1),
				actorId: board!._id,
			});
			await ctx.db.insert("doorLog", logRow(2));
		});
		const board = t.withIdentity({ email: "board@example.com" });

		const head = await board.query(api.doorLog.listSince, {
			since: null,
		});
		expect(head.map((r) => r.actorName)).toEqual([undefined, "Bo Ard"]);
		const older = await board.query(api.doorLog.listBefore, {
			before: 3,
			paginationOpts: firstPage,
		});
		expect(older.page.map((r) => r.actorName)).toEqual([
			undefined,
			"Bo Ard",
		]);
	});
});

describe("doorLog.record", () => {
	it("inserts nothing for an empty batch", async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.doorLog.record, { rows: [] });
		const rows = await t.run(async (ctx) =>
			ctx.db.query("doorLog").collect()
		);
		expect(rows).toHaveLength(0);
	});

	it("stores a row's slot", async () => {
		// The field the per-door unlock debounce indexes on
		// (doorInternal.doorActionContext) must actually reach the table — this
		// mutation is the only insert path for an action-written row, so a
		// handler that forgets to forward `slot` would silently break that
		// debounce in production while every other assertion here still passes.
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);

		await t.mutation(internal.doorLog.record, {
			rows: [
				{
					operation: "unlock",
					trigger: "app",
					personId,
					email: "ada@example.com",
					name: "Ada Lovelace",
					lockNames: ["Downstairs"],
					outcome: "ok",
					slot: "downstairs",
				},
			],
		});

		const rows = await t.run(async (ctx) =>
			ctx.db.query("doorLog").collect()
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.slot).toBe("downstairs");
	});
});

describe("door attempts", () => {
	const T0 = Date.UTC(2026, 9, 8, 12, 0);
	const ADA = "ada@example.com";
	const BEA = "bea@example.com";

	beforeEach(() => {
		// Accepted attempts schedule polls; fake timers keep them from running
		// after the test.
		vi.useFakeTimers();
		vi.setSystemTime(T0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	async function withAda() {
		const t = convexTest(schema, modules);
		const personId = await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: ADA,
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: T0,
			})
		);
		return { t, personId };
	}

	function attemptArgs(
		personId: Id<"people">,
		actuation: "accepted" | "actuated" = "accepted"
	) {
		return {
			action: "unlock" as const,
			slot: "downstairs" as const,
			personId,
			email: ADA,
			name: "Ada Lovelace",
			lockName: "Downstairs",
			durationMs: 3000,
			positionBefore: "locked" as const,
			actuation,
			requestedAt: T0,
			...(actuation === "actuated" ? { actuatedAt: T0 } : {}),
		};
	}

	const CHAIN = {
		action: "unlock" as const,
		positionBefore: "locked" as const,
	};

	async function jobs(t: TestConvex<typeof schema>) {
		const all = await t.run(async (ctx) =>
			ctx.db.system.query("_scheduled_functions").collect()
		);
		return all.map((job) => ({
			name: job.name,
			args: job.args,
			scheduledTime: job.scheduledTime,
		}));
	}

	async function polls(t: TestConvex<typeof schema>) {
		return (await jobs(t)).filter(
			(job) => job.name === "doorActions:pollActuation"
		);
	}

	async function rowOf(t: TestConvex<typeof schema>, id: Id<"doorLog">) {
		return t.run(async (ctx) => ctx.db.get(id));
	}

	it("recordAttempt writes an accepted attempt and schedules its first poll and its timeout, which counts from the request", async () => {
		const PROVIDER_LAG_MS = 1500;
		const { t, personId } = await withAda();
		const id = await t.mutation(internal.doorLog.recordAttempt, {
			...attemptArgs(personId),
			requestedAt: T0 - PROVIDER_LAG_MS,
		});
		const row = await rowOf(t, id);
		expect(row).toMatchObject({
			at: T0,
			operation: "unlock",
			trigger: "app",
			outcome: "ok",
			personId,
			actorId: personId,
			email: ADA,
			slot: "downstairs",
			lockNames: ["Downstairs"],
			durationMs: 3000,
			actuation: "accepted",
			requestedAt: T0 - PROVIDER_LAG_MS,
		});
		expect(row).not.toHaveProperty("actuatedAt");
		expect(await jobs(t)).toEqual([
			{
				name: "doorActions:pollActuation",
				args: [{ id, ...CHAIN, slot: "downstairs" }],
				scheduledTime: T0 + CONFIRM_POLL_MS,
			},
			{
				name: "doorLog:actuationTimeout",
				args: [{ id, ...CHAIN }],
				scheduledTime: T0 - PROVIDER_LAG_MS + CONFIRM_WINDOW_MS,
			},
		]);
	});

	it("recordAttempt schedules nothing for an attempt the door had already completed", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId, "actuated")
		);
		expect(await rowOf(t, id)).toMatchObject({
			actuation: "actuated",
			requestedAt: T0,
			actuatedAt: T0,
		});
		expect(await jobs(t)).toEqual([]);
	});

	it("a reading that shows the reaction marks the attempt actuated and polls no more", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "unlocking",
			at: T0 + CONFIRM_POLL_MS,
		});
		expect(await rowOf(t, id)).toMatchObject({
			actuation: "actuated",
			actuatedAt: T0 + CONFIRM_POLL_MS,
		});
		expect(await polls(t)).toHaveLength(1);
	});

	it("a reading with no reaction keeps the attempt accepted and schedules the next poll", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "locked",
			at: T0,
		});
		expect(await rowOf(t, id)).toMatchObject({ actuation: "accepted" });
		const scheduled = await polls(t);
		expect(scheduled).toHaveLength(2);
		expect(scheduled[1]).toEqual({
			name: "doorActions:pollActuation",
			args: [{ id, ...CHAIN, slot: "downstairs" }],
			scheduledTime: T0 + CONFIRM_POLL_MS,
		});
	});

	it("the last reading that fits the window schedules no further poll", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "locked",
			at: T0 + CONFIRM_WINDOW_MS - CONFIRM_POLL_MS,
		});
		expect(await polls(t)).toHaveLength(1);
	});

	it("the timeout marks an attempt the door never reacted to unconfirmed", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.actuationTimeout, { id, ...CHAIN });
		expect(await rowOf(t, id)).toMatchObject({ actuation: "unconfirmed" });
	});

	it("a reading after the timeout never moves the attempt", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.actuationTimeout, { id, ...CHAIN });
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "unlocking",
			at: T0 + CONFIRM_WINDOW_MS + CONFIRM_POLL_MS,
		});
		const row = await rowOf(t, id);
		expect(row).toMatchObject({ actuation: "unconfirmed" });
		expect(row?.actuatedAt).toBeUndefined();
		expect(await polls(t)).toHaveLength(1);
	});

	it("the timeout leaves an attempt the door reacted to alone", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "unlocking",
			at: T0 + CONFIRM_POLL_MS,
		});
		await t.mutation(internal.doorLog.actuationTimeout, { id, ...CHAIN });
		expect(await rowOf(t, id)).toMatchObject({
			actuation: "actuated",
			actuatedAt: T0 + CONFIRM_POLL_MS,
		});
	});

	it("a reading for a row with no attempt changes nothing", async () => {
		const { t, personId } = await withAda();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("doorLog", {
				at: T0,
				operation: "unlock",
				trigger: "app",
				personId,
				email: ADA,
				name: "Ada Lovelace",
				lockNames: ["Downstairs"],
				outcome: "ok",
				slot: "downstairs",
			})
		);
		await t.mutation(internal.doorLog.applyActuationReading, {
			id,
			...CHAIN,
			position: "unlocking",
			at: T0,
		});
		expect(await rowOf(t, id)).not.toHaveProperty("actuation");
		expect(await jobs(t)).toEqual([]);
	});

	it("attempt returns the caller's own attempt", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		expect(
			await t
				.withIdentity({ email: ADA })
				.query(api.doorLog.attempt, { id })
		).toEqual({ actuation: "accepted", durationMs: 3000, requestedAt: T0 });
	});

	it("attempt is null for someone else's attempt", async () => {
		const { t, personId } = await withAda();
		await t.run(async (ctx) =>
			ctx.db.insert("people", {
				email: BEA,
				firstName: "Bea",
				lastName: "B",
				tier: "member",
				stage: "active",
				stageSince: T0,
			})
		);
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		expect(
			await t
				.withIdentity({ email: BEA })
				.query(api.doorLog.attempt, { id })
		).toBeNull();
	});

	it("attempt is null for a row with no attempt", async () => {
		const { t, personId } = await withAda();
		const id = await t.run(async (ctx) =>
			ctx.db.insert("doorLog", {
				at: T0,
				operation: "unlock",
				trigger: "app",
				personId,
				email: ADA,
				name: "Ada Lovelace",
				lockNames: ["Downstairs"],
				outcome: "failed",
				slot: "downstairs",
				detail: "offline",
			})
		);
		expect(
			await t
				.withIdentity({ email: ADA })
				.query(api.doorLog.attempt, { id })
		).toBeNull();
	});

	it("attempt is null when signed out", async () => {
		const { t, personId } = await withAda();
		const id = await t.mutation(
			internal.doorLog.recordAttempt,
			attemptArgs(personId)
		);
		expect(await t.query(api.doorLog.attempt, { id })).toBeNull();
	});
});
