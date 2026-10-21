import { getFunctionName } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { FakeOccupancyProvider } from "./lib/fakeOccupancyProvider.ts";
import { setOccupancyProviderForTests } from "./lib/occupancy/provider.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const MINUTE = 60_000;
const DAY = 86_400_000;
const EVENT_BATCH = 500;
// 2026-10-21 10:00 Zurich (CEST).
const T0 = Date.parse("2026-10-21T08:00:00Z");

type Backend = TestConvex<typeof schema>;

afterEach(() => {
	setOccupancyProviderForTests(undefined);
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

async function person(
	backend: Backend,
	email: string,
	tier: "member" | "board" | "staff"
) {
	await backend.run((context) =>
		context.db.insert("people", {
			email,
			firstName: "Test",
			lastName: "",
			tier,
			stage: "active",
			stageSince: T0,
		})
	);
	return backend.withIdentity({ email });
}

function setNow(at: number) {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(at);
}

function days(backend: Backend) {
	return backend.run((context) =>
		context.db.query("occupancyDays").collect()
	);
}

function row(backend: Backend) {
	return backend.run((context) => context.db.query("occupancy").first());
}

async function minutes(backend: Backend): Promise<number> {
	const [first] = await days(backend);
	return first.personMinutes;
}

async function count(backend: Backend): Promise<number | undefined> {
	const stored = await row(backend);
	return stored?.count;
}

function events(backend: Backend) {
	return backend.run((context) =>
		context.db.query("occupancyEvents").collect()
	);
}

async function dayKeys(backend: Backend): Promise<string[]> {
	const rows = await days(backend);
	return rows.map((entry) => entry.day);
}

async function eventIds(backend: Backend): Promise<string[]> {
	const rows = await events(backend);
	return rows.map((event) => event.eventId);
}

async function minutesByDay(backend: Backend): Promise<Record<string, number>> {
	const rows = await days(backend);
	return Object.fromEntries(
		rows.map((entry) => [entry.day, entry.personMinutes])
	);
}

function reset(backend: Backend, at: number) {
	setNow(at);
	return backend.mutation(internal.occupancy.resetDay, {});
}

function apply(
	backend: Backend,
	updates: (typeof internal.occupancy.applyUpdates)["_args"]["updates"],
	at: number
) {
	return backend.mutation(internal.occupancy.applyUpdates, { updates, at });
}

it("refuses a caller with no app role", async () => {
	const backend = convexTest(schema, modules);
	await expect(backend.query(api.occupancy.current, {})).rejects.toThrow(
		/NotAuthenticated|Forbidden/
	);
});

it("answers a member", async () => {
	const backend = convexTest(schema, modules);
	const member = await person(backend, "mem@example.com", "member");
	// No provider is active: occupancy is disabled, not unknown.
	expect(await member.query(api.occupancy.current, {})).toEqual({
		enabled: false,
	});
});

it("refuses staff: occupancy is for the community", async () => {
	const backend = convexTest(schema, modules);
	const staff = await person(backend, "staff@example.com", "staff");
	await expect(staff.query(api.occupancy.current, {})).rejects.toThrow(
		/Forbidden/
	);
});

it("stores an absolute count and opens the day", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "count", count: 3 }], T0);
	expect(await row(backend)).toMatchObject({
		count: 3,
		updatedAt: T0,
		reportedAt: T0,
	});
	const [day, ...rest] = await days(backend);
	expect(rest).toEqual([]);
	expect(day).toMatchObject({
		day: "2026-10-21",
		peak: 3,
		peakAt: T0,
		personMinutes: 0,
	});
	expect(day.entries).toBeUndefined();
});

it("credits the time between updates at the old count", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "count", count: 3 }], T0);
	await apply(backend, [{ type: "count", count: 1 }], T0 + 10 * MINUTE);
	const [day] = await days(backend);
	expect(day).toMatchObject({ personMinutes: 30, peak: 3, peakAt: T0 });
});

it("credits a count only up to the end of its own site day", async () => {
	const backend = convexTest(schema, modules);
	await apply(
		backend,
		[{ type: "count", count: 2 }],
		Date.parse("2026-10-21T01:00:00Z")
	);
	await apply(
		backend,
		[{ type: "count", count: 0 }],
		Date.parse("2026-10-21T03:00:00Z")
	);
	expect(await minutesByDay(backend)).toEqual({ "2026-10-20": 120 });
});

it("applies deltas in order, tracking peak and entries", async () => {
	const backend = convexTest(schema, modules);
	await apply(
		backend,
		[
			{ type: "delta", change: 1 },
			{ type: "delta", change: 1 },
			{ type: "delta", change: -1 },
		],
		T0
	);
	expect(await count(backend)).toBe(1);
	const [day] = await days(backend);
	expect(day).toMatchObject({ peak: 2, entries: 2 });
});

it("never goes below zero", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "delta", change: -1 }], T0);
	expect(await count(backend)).toBe(0);
});

it("applies a retried event id once", async () => {
	const backend = convexTest(schema, modules);
	const update = { type: "delta", change: 1, eventId: "a" } as const;
	await apply(backend, [update], T0);
	await apply(backend, [update], T0 + MINUTE);
	expect(await count(backend)).toBe(1);
	const [day] = await days(backend);
	expect(day.entries).toBe(1);
	const events = await backend.run((context) =>
		context.db.query("occupancyEvents").collect()
	);
	expect(events).toHaveLength(1);
});

describe("the site day boundary", () => {
	// 2026-10-21 22:00 Zurich (CEST); the next day starts at 02:00Z.
	const EVENING = Date.parse("2026-10-21T20:00:00Z");
	const BOUNDARY = Date.parse("2026-10-22T02:00:00Z");
	const STALE = 3;

	async function staleEvening(backend: Backend) {
		await apply(backend, [{ type: "count", count: STALE }], EVENING);
	}

	it("starts a delivery after the boundary from an empty space", async () => {
		const backend = convexTest(schema, modules);
		await staleEvening(backend);
		await apply(
			backend,
			[{ type: "delta", change: 1 }],
			BOUNDARY + 30 * MINUTE
		);
		expect(await count(backend)).toBe(1);
		expect(await minutesByDay(backend)).toEqual({
			"2026-10-21": STALE * 6 * 60,
			"2026-10-22": 0,
		});
		const rows = await days(backend);
		const newDay = rows.find((entry) => entry.day === "2026-10-22");
		expect(newDay).toMatchObject({
			peak: 1,
			peakAt: BOUNDARY + 30 * MINUTE,
			entries: 1,
		});
	});

	it("opens no day row for a heartbeat after the boundary", async () => {
		const backend = convexTest(schema, modules);
		await staleEvening(backend);
		await apply(backend, [], BOUNDARY + 30 * MINUTE);
		expect(await count(backend)).toBe(0);
		expect(await dayKeys(backend)).toEqual(["2026-10-21"]);
	});

	it("keeps the count within a day: peak from the stored row, not the count", async () => {
		const backend = convexTest(schema, modules);
		await staleEvening(backend);
		await apply(backend, [{ type: "delta", change: -1 }], EVENING + MINUTE);
		expect(await count(backend)).toBe(STALE - 1);
		const [day] = await days(backend);
		expect(day).toMatchObject({ peak: STALE, peakAt: EVENING });
	});

	it("leaves the count alone before the boundary", async () => {
		const backend = convexTest(schema, modules);
		await staleEvening(backend);
		await reset(backend, BOUNDARY - 30 * MINUTE);
		expect(await row(backend)).toMatchObject({
			count: STALE,
			updatedAt: EVENING,
		});
		expect(await minutesByDay(backend)).toEqual({ "2026-10-21": 0 });
	});

	it("resets once after the boundary, crediting only up to it", async () => {
		const backend = convexTest(schema, modules);
		await staleEvening(backend);
		const late = BOUNDARY + 60 * MINUTE;
		await reset(backend, late);
		expect(await row(backend)).toMatchObject({
			count: 0,
			updatedAt: late,
			reportedAt: EVENING,
		});
		expect(await minutesByDay(backend)).toEqual({
			"2026-10-21": STALE * 6 * 60,
		});
		await reset(backend, late + 60 * MINUTE);
		expect(await row(backend)).toMatchObject({ count: 0, updatedAt: late });
		expect(await minutesByDay(backend)).toEqual({
			"2026-10-21": STALE * 6 * 60,
		});
	});

	it("resets exactly at 04:00 in winter", async () => {
		const backend = convexTest(schema, modules);
		// 2026-10-26 22:00 CET; the next day starts at 03:00Z.
		const evening = Date.parse("2026-10-26T21:00:00Z");
		const boundary = Date.parse("2026-10-27T03:00:00Z");
		await apply(backend, [{ type: "count", count: 2 }], evening);
		await reset(backend, boundary - 1);
		expect(await count(backend)).toBe(2);
		await reset(backend, boundary);
		expect(await row(backend)).toMatchObject({
			count: 0,
			updatedAt: boundary,
		});
		expect(await minutesByDay(backend)).toEqual({
			"2026-10-26": 2 * 6 * 60,
		});
	});
});

describe("the site day boundary on a DST change day", () => {
	it("waits for 04:00 CET on the autumn change day", async () => {
		const backend = convexTest(schema, modules);
		// DST ends 2026-10-25 at 01:00Z; 04:00 CET is 03:00Z, so the day of
		// the 24th runs 25 hours and 02:00Z (03:00 CET) is still inside it.
		await apply(
			backend,
			[{ type: "count", count: 2 }],
			Date.parse("2026-10-24T21:00:00Z")
		);
		await reset(backend, Date.parse("2026-10-25T02:00:00Z"));
		expect(await count(backend)).toBe(2);
		await reset(backend, Date.parse("2026-10-25T03:00:00Z"));
		expect(await count(backend)).toBe(0);
		expect(await minutesByDay(backend)).toEqual({
			"2026-10-24": 2 * 6 * 60,
		});
	});

	it("resets at 04:00 CEST on the spring change day", async () => {
		const backend = convexTest(schema, modules);
		// DST starts 2026-03-29 at 01:00Z; 04:00 CEST is 02:00Z.
		await apply(
			backend,
			[{ type: "count", count: 2 }],
			Date.parse("2026-03-28T21:00:00Z")
		);
		await reset(backend, Date.parse("2026-03-29T01:59:59Z"));
		expect(await count(backend)).toBe(2);
		await reset(backend, Date.parse("2026-03-29T02:00:00Z"));
		expect(await count(backend)).toBe(0);
	});
});

describe("seen event ids", () => {
	it("still skips a retry delivered just after the boundary", async () => {
		const backend = convexTest(schema, modules);
		const update = { type: "delta", change: 1, eventId: "a" } as const;
		const before = Date.parse("2026-10-22T01:50:00Z");
		setNow(before);
		await apply(backend, [update], before);
		const boundary = Date.parse("2026-10-22T02:00:00Z");
		await reset(backend, boundary);
		await apply(backend, [update], boundary + MINUTE);
		expect(await count(backend)).toBe(0);
		expect(await dayKeys(backend)).toEqual(["2026-10-21"]);
		expect(await events(backend)).toHaveLength(1);
	});

	it("deletes ids older than a day", async () => {
		const backend = convexTest(schema, modules);
		setNow(T0);
		await apply(
			backend,
			[{ type: "delta", change: 1, eventId: "old" }],
			T0
		);
		setNow(T0 + 2 * MINUTE);
		await apply(
			backend,
			[{ type: "delta", change: 1, eventId: "recent" }],
			T0 + 2 * MINUTE
		);
		await reset(backend, T0 + DAY + MINUTE);
		expect(await eventIds(backend)).toEqual(["recent"]);
	});

	it("reschedules the cleanup while a batch is full", async () => {
		const backend = convexTest(schema, modules);
		setNow(T0);
		await backend.run(async (context) => {
			for (let index = 0; index < EVENT_BATCH + 1; index++) {
				await context.db.insert("occupancyEvents", {
					eventId: String(index),
				});
			}
		});
		await reset(backend, T0 + 2 * DAY);
		expect(await events(backend)).toHaveLength(1);
		const scheduled = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(scheduled.map((job) => job.name)).toEqual([
			getFunctionName(internal.occupancy.clearEvents),
		]);
	});
});

it("answers current from the stored count", async () => {
	const backend = convexTest(schema, modules);
	const member = await person(backend, "mem@example.com", "member");
	expect(await member.query(api.occupancy.current, {})).toEqual({
		enabled: false,
	});
	setOccupancyProviderForTests(new FakeOccupancyProvider({ count: 0 }));
	expect(await member.query(api.occupancy.current, {})).toEqual({
		enabled: true,
		count: null,
		capacity: 40,
	});
	await apply(backend, [{ type: "count", count: 5 }], T0);
	expect(await member.query(api.occupancy.current, {})).toEqual({
		enabled: true,
		count: 5,
		capacity: 40,
	});
});

it("ignores a stored offline flag once the provider has no silence limit", async () => {
	const backend = convexTest(schema, modules);
	const member = await person(backend, "mem@example.com", "member");
	setOccupancyProviderForTests(
		new FakeOccupancyProvider({ count: 5, maxSilenceMs: 15 * MINUTE })
	);
	await apply(backend, [{ type: "count", count: 5 }], T0);
	await backend.mutation(internal.occupancy.recordSilence, {
		maxSilenceMs: 1,
	});
	expect(await row(backend)).toMatchObject({ offline: true });
	expect(await member.query(api.occupancy.current, {})).toMatchObject({
		count: null,
	});
	setOccupancyProviderForTests(new FakeOccupancyProvider({ count: 5 }));
	expect(await member.query(api.occupancy.current, {})).toMatchObject({
		count: 5,
	});
});

it("answers unknown while the counter is offline, and the count once it reports", async () => {
	const backend = convexTest(schema, modules);
	const member = await person(backend, "mem@example.com", "member");
	const provider = new FakeOccupancyProvider({
		count: 5,
		maxSilenceMs: 15 * MINUTE,
	});
	provider.failure = { type: "OccupancyProviderFailed", detail: "down" };
	setOccupancyProviderForTests(provider);
	vi.spyOn(console, "warn").mockImplementation(() => {});
	await apply(backend, [{ type: "count", count: 5 }], T0);
	await poll(backend, T0 + 5 * MINUTE);
	expect(await row(backend)).not.toHaveProperty("offline");
	await poll(backend, T0 + 20 * MINUTE);
	expect(await row(backend)).toMatchObject({ offline: true });
	expect(await member.query(api.occupancy.current, {})).toMatchObject({
		count: null,
	});
	await apply(backend, [{ type: "count", count: 2 }], T0 + 21 * MINUTE);
	expect(await row(backend)).not.toHaveProperty("offline");
	expect(await member.query(api.occupancy.current, {})).toMatchObject({
		count: 2,
	});
});

it("stops accruing past the counter's silence limit", async () => {
	const capped = convexTest(schema, modules);
	setOccupancyProviderForTests(
		new FakeOccupancyProvider({ count: 0, maxSilenceMs: 15 * MINUTE })
	);
	await apply(capped, [{ type: "count", count: 4 }], T0);
	await apply(capped, [{ type: "count", count: 4 }], T0 + 60 * MINUTE);
	expect(await minutes(capped)).toBe(60);

	const uncapped = convexTest(schema, modules);
	setOccupancyProviderForTests(undefined);
	await apply(uncapped, [{ type: "count", count: 4 }], T0);
	await apply(uncapped, [{ type: "count", count: 4 }], T0 + 60 * MINUTE);
	expect(await minutes(uncapped)).toBe(240);
});

it("treats an empty delivery as a heartbeat", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "count", count: 2 }], T0);
	await apply(backend, [], T0 + 5 * MINUTE);
	expect(await row(backend)).toMatchObject({
		count: 2,
		reportedAt: T0 + 5 * MINUTE,
	});
	expect(await minutes(backend)).toBe(10);
});

it("keeps the latest report when a delivery arrives out of order", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "count", count: 2 }], T0);
	await apply(backend, [], T0 - MINUTE);
	expect(await row(backend)).toMatchObject({ updatedAt: T0, reportedAt: T0 });
});

it("gives a late delivery from before the boundary to the day of the stored write", async () => {
	const backend = convexTest(schema, modules);
	// 04:00 Zurich on 2026-10-22 is 02:00Z.
	const after = Date.parse("2026-10-22T02:00:01Z");
	const before = Date.parse("2026-10-22T01:59:59Z");
	await apply(backend, [{ type: "delta", change: 1 }], after);
	await apply(backend, [{ type: "delta", change: 1 }], before);
	expect(await count(backend)).toBe(2);
	expect(await days(backend)).toMatchObject([
		{ day: "2026-10-22", peak: 2, peakAt: after, entries: 2 },
	]);
});

it("opens no day row for an empty space with nothing to record", async () => {
	const backend = convexTest(schema, modules);
	await apply(backend, [{ type: "count", count: 0 }], T0);
	await apply(backend, [], T0 + MINUTE);
	expect(await days(backend)).toEqual([]);
});

it("counts a counter that never reported as offline, without a row", async () => {
	const backend = convexTest(schema, modules);
	expect(
		await backend.mutation(internal.occupancy.recordSilence, {
			maxSilenceMs: MINUTE,
		})
	).toEqual({ reportedAt: null, isOffline: true });
	expect(await row(backend)).toBeNull();
});

it("keeps reportedAt on reset and caps its accrual", async () => {
	const backend = convexTest(schema, modules);
	setOccupancyProviderForTests(
		new FakeOccupancyProvider({ count: 0, maxSilenceMs: 15 * MINUTE })
	);
	const evening = Date.parse("2026-10-21T21:00:00Z");
	const boundary = Date.parse("2026-10-22T02:00:00Z");
	await apply(backend, [{ type: "count", count: 4 }], evening);
	await reset(backend, boundary);
	expect(await row(backend)).toMatchObject({
		count: 0,
		reportedAt: evening,
		updatedAt: boundary,
	});
	expect(await minutes(backend)).toBe(60);
});

it("limits attendance to the board", async () => {
	const backend = convexTest(schema, modules);
	const member = await person(backend, "mem@example.com", "member");
	await expect(member.query(api.occupancy.attendance, {})).rejects.toThrow(
		/Forbidden/
	);
});

it("answers attendance from the day a year and a day back", async () => {
	const backend = convexTest(schema, modules);
	const board = await person(backend, "board@example.com", "board");
	setOccupancyProviderForTests(new FakeOccupancyProvider({ count: 0 }));
	setNow(T0);
	await backend.run(async (context) => {
		for (const day of ["2025-10-19", "2025-10-20"]) {
			await context.db.insert("occupancyDays", {
				day,
				peak: 1,
				peakAt: T0,
				personMinutes: 0,
			});
		}
	});
	const answer = await board.query(api.occupancy.attendance, {});
	expect(answer.enabled && answer.days.map((entry) => entry.day)).toEqual([
		"2025-10-20",
	]);
});

it("answers attendance oldest first, within the last year", async () => {
	const backend = convexTest(schema, modules);
	const board = await person(backend, "board@example.com", "board");
	expect(await board.query(api.occupancy.attendance, {})).toEqual({
		enabled: false,
	});
	setOccupancyProviderForTests(new FakeOccupancyProvider({ count: 0 }));
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(T0);
	await backend.run(async (context) => {
		for (const [day, peak] of [
			["2026-10-20", 7],
			["2025-01-01", 9],
			["2026-10-19", 5],
		] as const) {
			await context.db.insert("occupancyDays", {
				day,
				peak,
				peakAt: T0,
				personMinutes: 10,
			});
		}
	});
	const answer = await board.query(api.occupancy.attendance, {});
	expect(answer).toEqual({
		enabled: true,
		capacity: 40,
		days: [
			{ day: "2026-10-19", peak: 5, peakAt: T0, personMinutes: 10 },
			{ day: "2026-10-20", peak: 7, peakAt: T0, personMinutes: 10 },
		],
	});
});

function notifications(backend: Backend) {
	return backend.run((context) =>
		context.db.query("notifications").collect()
	);
}

function poll(backend: Backend, at = T0) {
	setNow(at);
	return backend.action(internal.occupancy.poll, {});
}

it("polls the counter's headcount into the stored count", async () => {
	const backend = convexTest(schema, modules);
	setOccupancyProviderForTests(new FakeOccupancyProvider({ count: 6 }));
	await poll(backend);
	expect(await row(backend)).toMatchObject({ count: 6, reportedAt: T0 });
});

it("polls nothing without a counter or from a push-only one", async () => {
	const backend = convexTest(schema, modules);
	await poll(backend);
	expect(await row(backend)).toBeNull();
	const pushOnly = new FakeOccupancyProvider({ updates: [] });
	setOccupancyProviderForTests(pushOnly);
	await poll(backend);
	expect(await row(backend)).toBeNull();
	expect(pushOnly.calls.reads).toBe(0);
});

it("skips a failed read and logs it", async () => {
	const backend = convexTest(schema, modules);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
	const provider = new FakeOccupancyProvider({ count: 6 });
	provider.failure = { type: "OccupancyProviderFailed", detail: "timeout" };
	setOccupancyProviderForTests(provider);
	await poll(backend);
	expect(await row(backend)).toBeNull();
	expect(warn).toHaveBeenCalledWith("[occupancy-poll] timeout");
});

async function boardBackend() {
	vi.stubEnv("SITE_URL", "https://example.com");
	const backend = convexTest(schema, modules);
	await person(backend, "board@example.com", "board");
	return backend;
}

function boardId(backend: Backend) {
	return backend.run(async (context) => {
		const board = await context.db
			.query("people")
			.withIndex("by_email", (index) =>
				index.eq("email", "board@example.com")
			)
			.unique();
		return board?._id;
	});
}

describe("offline alert", () => {
	const SILENCE = 15 * MINUTE;

	it("alerts the board once while a push counter stays silent, then once on return", async () => {
		const backend = await boardBackend();
		setOccupancyProviderForTests(
			new FakeOccupancyProvider({ updates: [], maxSilenceMs: SILENCE })
		);
		await poll(backend);
		const sentFirst = await notifications(backend);
		expect(sentFirst).toHaveLength(1);
		const [first] = sentFirst;
		expect(first).toMatchObject({
			personId: await boardId(backend),
			kind: "occupancyAlert",
			title: "Occupancy counter offline",
			url: "/community?tab=insights",
		});
		expect(first.body).toContain("No report yet.");

		await poll(backend, T0 + 5 * MINUTE);
		expect(await notifications(backend)).toHaveLength(1);

		await apply(backend, [], T0 + 10 * MINUTE);
		await poll(backend, T0 + 11 * MINUTE);
		const sent = await notifications(backend);
		expect(sent.map((item) => item.title)).toEqual([
			"Occupancy counter offline",
			"Occupancy counter back online",
		]);
	});

	it("names the last report once the counter has gone quiet", async () => {
		const backend = await boardBackend();
		await apply(backend, [{ type: "count", count: 2 }], T0);
		const provider = new FakeOccupancyProvider({
			count: 2,
			maxSilenceMs: SILENCE,
		});
		provider.failure = { type: "OccupancyProviderFailed", detail: "down" };
		setOccupancyProviderForTests(provider);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await poll(backend, T0 + 20 * MINUTE);
		const [alert] = await notifications(backend);
		expect(alert.body).toContain("No report since 10:00.");
	});

	it("names the date of a last report from an earlier day", async () => {
		const backend = await boardBackend();
		await apply(backend, [{ type: "count", count: 2 }], T0 - DAY);
		const provider = new FakeOccupancyProvider({
			count: 2,
			maxSilenceMs: SILENCE,
		});
		provider.failure = { type: "OccupancyProviderFailed", detail: "down" };
		setOccupancyProviderForTests(provider);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		await poll(backend, T0);
		const [alert] = await notifications(backend);
		expect(alert.body).toContain(
			"No report since 20 Oct 2026, 10:00 CEST."
		);
	});

	it("never alerts for a counter without a silence limit", async () => {
		const backend = await boardBackend();
		setOccupancyProviderForTests(
			new FakeOccupancyProvider({ updates: [] })
		);
		await poll(backend);
		await poll(backend, T0 + 60 * MINUTE);
		expect(await notifications(backend)).toEqual([]);
	});
});

it("takes counter webhook deliveries on the route, behind the secret", async () => {
	vi.stubEnv("OCCUPANCY_WEBHOOK_SECRET", "s3cret-for-tests");
	const backend = convexTest(schema, modules);
	setOccupancyProviderForTests(
		new FakeOccupancyProvider({ updates: [{ type: "delta", change: 1 }] })
	);
	const denied = await backend.fetch("/occupancy/webhook", {
		method: "POST",
		body: "{}",
	});
	expect(denied.status).toBe(401);
	expect(await row(backend)).toBeNull();
	const accepted = await backend.fetch("/occupancy/webhook", {
		method: "POST",
		headers: { authorization: "Bearer s3cret-for-tests" },
		body: "{}",
	});
	expect(accepted.status).toBe(200);
	expect(await count(backend)).toBe(1);
});
