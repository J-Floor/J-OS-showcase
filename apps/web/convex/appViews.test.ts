import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { SHOWN_TOP } from "./lib/appViews.ts";
import { rateLimiter } from "./lib/rateLimit.ts";
import { sha256HexOfText } from "./lib/sha256.ts";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");
const BOARD = { email: "board@example.com" };
const MEMBER = { email: "member@example.com" };
const GUEST = { email: "guest@example.com" };
const TODAY = "2026-11-10";
const EVENT_FIXTURE = {
	name: "Demo night",
	startsAt: Date.UTC(2026, 11, 1, 18),
	endsAt: Date.UTC(2026, 11, 1, 20),
	startsAtLocal: "2026-12-01T19:00:00+01:00[Europe/Zurich]",
	endsAtLocal: "2026-12-01T21:00:00+01:00[Europe/Zurich]",
	createdAt: Date.UTC(2026, 10, 1),
};

async function seed() {
	const backend = convexTest(schema, modules);
	rateLimiterTest.register(backend);
	const eventId = await backend.run(async (context) => {
		for (const [email, tier] of [
			[BOARD.email, "board"],
			[MEMBER.email, "member"],
			[GUEST.email, "guest"],
		] as const)
			await context.db.insert("people", {
				email,
				firstName: "Test",
				lastName: tier,
				tier,
				stage: "active",
				stageSince: Date.now(),
			});
		await context.db.insert("viewSalts", { day: TODAY, salt: "s" });
		return context.db.insert("events", EVENT_FIXTURE);
	});
	return { backend, eventId };
}

function rowsOf<
	Table extends "viewHits" | "viewDaily" | "viewSalts" | "people",
>(backend: TestConvex<typeof schema>, table: Table) {
	return backend.run((context) => context.db.query(table).collect());
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(Date.UTC(2026, 10, 10, 12));
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("recordView", () => {
	it("counts one view per person per key per day, in the viewer's bucket", async () => {
		const { backend } = await seed();
		const member = backend.withIdentity(MEMBER);
		await member.mutation(api.appViews.recordView, { key: "page:events" });
		await member.mutation(api.appViews.recordView, { key: "page:events" });
		await backend
			.withIdentity(GUEST)
			.mutation(api.appViews.recordView, { key: "page:events" });
		await backend
			.withIdentity(BOARD)
			.mutation(api.appViews.recordView, { key: "page:events" });
		expect(
			await backend
				.withIdentity(BOARD)
				.query(api.appViews.today, { key: "page:events" })
		).toEqual({ members: 1, board: 1, guests: 1 });
	});

	it("counts an existing entity under its key and stores no name", async () => {
		const { backend, eventId } = await seed();
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: `event:${eventId}` });
		const rows = await rowsOf(backend, "viewDaily");
		expect(
			rows.map(({ day, key, members, board, guests, ...rest }) => ({
				row: { day, key, members, board, guests },
				rest: Object.keys(rest).filter(
					(field) => !field.startsWith("_")
				),
			}))
		).toEqual([
			{
				row: {
					day: TODAY,
					key: `event:${eventId}`,
					members: 1,
					board: 0,
					guests: 0,
				},
				rest: [],
			},
		]);
	});

	it("ignores unknown pages, unknown kinds and missing entities", async () => {
		const { backend } = await seed();
		const member = backend.withIdentity(MEMBER);
		for (const key of ["page:nope", "ghost:1", "event:not-an-id"])
			await member.mutation(api.appViews.recordView, { key });
		const hits = await rowsOf(backend, "viewHits");
		const daily = await rowsOf(backend, "viewDaily");
		expect({ hits: hits.length, daily: daily.length }).toEqual({
			hits: 0,
			daily: 0,
		});
	});

	it("stores a hash, never the person id", async () => {
		const { backend } = await seed();
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: "page:events" });
		const [hit] = await rowsOf(backend, "viewHits");
		const people = await rowsOf(backend, "people");
		const member = people.find((person) => person.email === MEMBER.email);
		const memberId = member?._id as string;
		expect(hit.viewerHash).toBe(await sha256HexOfText(`s:${memberId}`));
		expect(people.map((person) => person._id as string)).not.toContain(
			hit.viewerHash
		);
	});

	it("hashes the same person differently on another day", async () => {
		const { backend } = await seed();
		const member = backend.withIdentity(MEMBER);
		await member.mutation(api.appViews.recordView, { key: "page:events" });
		await backend.run((context) =>
			context.db.insert("viewSalts", { day: "2026-11-11", salt: "t" })
		);
		vi.setSystemTime(Date.UTC(2026, 10, 11, 12));
		await member.mutation(api.appViews.recordView, { key: "page:events" });
		const hits = await rowsOf(backend, "viewHits");
		expect(hits).toHaveLength(2);
		expect(new Set(hits.map((hit) => hit.viewerHash)).size).toBe(2);
	});

	it("without a salt for today, counts nothing and schedules the salt", async () => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			const salt = await context.db.query("viewSalts").first();
			if (salt) await context.db.delete(salt._id);
		});
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: "page:events" });
		const daily = await rowsOf(backend, "viewDaily");
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(daily).toHaveLength(0);
		expect(jobs.map((job) => job.name)).toContain("appViews:prepareSalts");
	});

	it("stops at an unknown key without asking for a salt", async () => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			const salt = await context.db.query("viewSalts").first();
			if (salt) await context.db.delete(salt._id);
		});
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: "ghost:1" });
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(0);
	});

	it("refuses a signed-out caller", async () => {
		const { backend } = await seed();
		await expect(
			backend.mutation(api.appViews.recordView, { key: "page:events" })
		).rejects.toThrow("NotAuthenticated");
	});

	it("writes nothing when the rate limiter refuses", async () => {
		const { backend } = await seed();
		vi.spyOn(rateLimiter, "limit").mockResolvedValue({
			ok: false,
			retryAfter: 1000,
		});
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: "page:events" });
		expect(await rowsOf(backend, "viewHits")).toHaveLength(0);
		expect(await rowsOf(backend, "viewDaily")).toHaveLength(0);
	});

	it("schedules no salt job for a rate-limited caller without a salt", async () => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			const salt = await context.db.query("viewSalts").first();
			if (salt) await context.db.delete(salt._id);
		});
		vi.spyOn(rateLimiter, "limit").mockResolvedValue({
			ok: false,
			retryAfter: 1000,
		});
		await backend
			.withIdentity(MEMBER)
			.mutation(api.appViews.recordView, { key: "page:events" });
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs).toHaveLength(0);
	});
});

describe("today", () => {
	it("is board-only", async () => {
		const { backend } = await seed();
		await expect(
			backend
				.withIdentity(MEMBER)
				.query(api.appViews.today, { key: "page:events" })
		).rejects.toThrow("Forbidden");
	});
	it("answers zeros for a key nobody viewed", async () => {
		const { backend } = await seed();
		expect(
			await backend
				.withIdentity(BOARD)
				.query(api.appViews.today, { key: "page:perks" })
		).toEqual({ members: 0, board: 0, guests: 0 });
	});
});

describe("ensureSalt", () => {
	it("keeps the first salt of a day", async () => {
		const { backend } = await seed();
		await backend.mutation(internal.appViews.ensureSalt, {
			day: TODAY,
			salt: "other",
		});
		const salts = await rowsOf(backend, "viewSalts");
		expect(salts.map((salt) => salt.salt)).toEqual(["s"]);
	});
});

function daily(day: string, key: string, members: number) {
	return { day, key, members, board: 0, guests: 0 };
}

describe("purgeExpired", () => {
	it("deletes past hits and salts, and counts older than 12 months", async () => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			await context.db.insert("viewSalts", {
				day: "2026-11-09",
				salt: "old",
			});
			await context.db.insert("viewHits", {
				day: "2026-11-09",
				viewerHash: "h",
				key: "page:events",
			});
			await context.db.insert("viewHits", {
				day: TODAY,
				viewerHash: "h",
				key: "page:events",
			});
			await context.db.insert(
				"viewDaily",
				daily("2025-11-09", "page:events", 1)
			);
			await context.db.insert(
				"viewDaily",
				daily("2025-11-10", "page:events", 1)
			);
			await context.db.insert(
				"viewDaily",
				daily("2025-11-11", "page:events", 1)
			);
		});
		await backend.mutation(internal.appViews.purgeExpired, {});
		const [salts, hits, days] = await Promise.all([
			rowsOf(backend, "viewSalts"),
			rowsOf(backend, "viewHits"),
			rowsOf(backend, "viewDaily"),
		]);
		const left = {
			salts: salts.map((row) => row.day),
			hits: hits.map((row) => row.day),
			daily: days.map((row) => row.day),
		};
		expect(left).toEqual({
			salts: [TODAY],
			hits: [TODAY],
			daily: ["2025-11-10", "2025-11-11"],
		});
	});

	it.each([
		[499, []],
		[500, ["appViews:purgeExpired"]],
	])("with %i expired hits schedules %j", async (count, expected) => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			for (let index = 0; index < count; index++)
				await context.db.insert("viewHits", {
					day: "2026-11-09",
					viewerHash: `h${index}`,
					key: "page:events",
				});
		});
		await backend.mutation(internal.appViews.purgeExpired, {});
		const jobs = await backend.run((context) =>
			context.db.system.query("_scheduled_functions").collect()
		);
		expect(jobs.map((job) => job.name)).toEqual(expected);
		expect(await rowsOf(backend, "viewHits")).toHaveLength(0);
	});
});

describe("rebuildSnapshots and summary", () => {
	it("builds each range from past days and merges today's counts live", async () => {
		const { backend, eventId } = await seed();
		const key = `event:${eventId}`;
		await backend.run(async (context) => {
			await context.db.insert("viewDaily", daily("2026-11-09", key, 2));
			await context.db.insert("viewDaily", daily("2026-11-01", key, 5));
			await context.db.insert("viewDaily", daily(TODAY, key, 1));
		});
		await backend.action(internal.appViews.rebuildSnapshots, {});
		const board = backend.withIdentity(BOARD);
		const week = await board.query(api.appViews.summary, { days: 7 });
		expect(week.summary.daily).toHaveLength(7);
		expect(week.summary.daily.at(-1)).toEqual({
			date: TODAY,
			members: 1,
			board: 0,
			guests: 0,
		});
		expect(week.summary.entities).toEqual([
			{ key, label: EVENT_FIXTURE.name, count: 3 },
		]);
		const month = await board.query(api.appViews.summary, { days: 30 });
		expect(month.summary.entities[0]?.count).toBe(8);
		expect(month.builtAt).not.toBeNull();
	});

	it("answers today's counts before any snapshot exists", async () => {
		const { backend } = await seed();
		await backend.run((context) =>
			context.db.insert("viewDaily", daily(TODAY, "page:events", 2))
		);
		const view = await backend
			.withIdentity(BOARD)
			.query(api.appViews.summary, { days: 7 });
		expect(view.builtAt).toBeNull();
		expect(view.summary.totals.members).toBe(2);
		expect(view.summary.pages).toEqual([
			{ key: "page:events", label: "Events", count: 2 },
		]);
	});

	it("drops a viewed person once they are deleted", async () => {
		const { backend, eventId } = await seed();
		const guestId = await backend.run(async (context) => {
			const guest = await context.db
				.query("people")
				.withIndex("by_email", (range) =>
					range.eq("email", GUEST.email)
				)
				.unique();
			return guest?._id;
		});
		const board = backend.withIdentity(BOARD);
		await board.mutation(api.appViews.recordView, {
			key: `person:${guestId}`,
		});
		await board.mutation(api.appViews.recordView, {
			key: `event:${eventId}`,
		});
		const before = await board.query(api.appViews.summary, { days: 7 });
		expect(before.summary.entities.map((view) => view.label)).toEqual([
			EVENT_FIXTURE.name,
			"Test guest",
		]);
		await backend.run(async (context) => {
			if (guestId) await context.db.delete(guestId);
		});
		const after = await board.query(api.appViews.summary, { days: 7 });
		expect(after.summary.entities).toEqual([
			{ key: `event:${eventId}`, label: EVENT_FIXTURE.name, count: 1 },
		]);
	});

	it("reads yesterday live while the snapshot predates it", async () => {
		const { backend } = await seed();
		await backend.run((context) =>
			context.db.insert(
				"viewDaily",
				daily("2026-11-08", "page:events", 4)
			)
		);
		await backend.action(internal.appViews.rebuildSnapshots, {});
		await backend.run(async (context) => {
			const snapshots = await context.db.query("viewSnapshots").collect();
			for (const snapshot of snapshots)
				await context.db.patch(snapshot._id, {
					builtAt: Date.UTC(2026, 10, 9, 8),
				});
			await context.db.insert(
				"viewDaily",
				daily("2026-11-09", "page:perks", 3)
			);
		});
		const view = await backend
			.withIdentity(BOARD)
			.query(api.appViews.summary, { days: 7 });
		expect(
			view.summary.daily.find((row) => row.date === "2026-11-09")
		).toEqual({ date: "2026-11-09", members: 3, board: 0, guests: 0 });
		expect(view.summary.totals.members).toBe(7);
	});

	it("reads yesterday live when no snapshot exists", async () => {
		const { backend } = await seed();
		await backend.run((context) =>
			context.db.insert(
				"viewDaily",
				daily("2026-11-09", "page:events", 5)
			)
		);
		const view = await backend
			.withIdentity(BOARD)
			.query(api.appViews.summary, { days: 7 });
		expect(view.summary.totals.members).toBe(5);
	});

	it("counts range edges: today-6 in 7, today-7 in 30, today-89 in 90, today-90 in none", async () => {
		const { backend } = await seed();
		await backend.run(async (context) => {
			for (const day of [
				"2026-11-04",
				"2026-11-03",
				"2026-08-13",
				"2026-08-12",
			])
				await context.db.insert(
					"viewDaily",
					daily(day, "page:events", 1)
				);
		});
		await backend.action(internal.appViews.rebuildSnapshots, {});
		const board = backend.withIdentity(BOARD);
		const totals = [];
		for (const days of [7, 30, 90] as const) {
			const view = await board.query(api.appViews.summary, { days });
			totals.push(view.summary.totals.members);
		}
		expect(totals).toEqual([1, 2, 3]);
	});

	it("fills the shown top from lower ranks when a ranked entry is gone", async () => {
		const { backend } = await seed();
		const keys = await backend.run(async (context) => {
			const made: string[] = [];
			for (let rank = 0; rank <= SHOWN_TOP; rank++) {
				const id = await context.db.insert("events", {
					...EVENT_FIXTURE,
					name: `Event ${String(rank)}`,
				});
				if (rank === 0) await context.db.delete(id);
				made.push(`event:${id}`);
				await context.db.insert(
					"viewDaily",
					daily(TODAY, `event:${id}`, 100 - rank)
				);
			}
			return made;
		});
		const view = await backend
			.withIdentity(BOARD)
			.query(api.appViews.summary, { days: 7 });
		expect(view.summary.entities.map((entry) => entry.key)).toEqual(
			keys.slice(1)
		);
	});

	it("is board-only", async () => {
		const { backend } = await seed();
		await expect(
			backend
				.withIdentity(MEMBER)
				.query(api.appViews.summary, { days: 7 })
		).rejects.toThrow("Forbidden");
	});
});
