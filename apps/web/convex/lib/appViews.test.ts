import { describe, expect, it } from "vitest";

import {
	bucketOf,
	buildSummary,
	mergeToday,
	NO_VIEWS,
	pageViewKey,
	parseViewKey,
	shiftDay,
	totalViews,
	type DailyRow,
} from "./appViews.ts";
import { randomHex, sha256HexOfText } from "./sha256.ts";

function row(day: string, key: string, members: number): DailyRow {
	return { day, key, members, board: 0, guests: 0 };
}

describe("parseViewKey", () => {
	it("reads a page key for a known module", () => {
		expect(parseViewKey("page:events")).toEqual({
			type: "page",
			moduleId: "events",
		});
	});
	it("refuses an unknown module, an unknown kind and an empty slug", () => {
		expect(parseViewKey("page:nope")).toBeUndefined();
		expect(parseViewKey("ghost:abc")).toBeUndefined();
		expect(parseViewKey("event:")).toBeUndefined();
		expect(parseViewKey("event")).toBeUndefined();
	});
	it("reads an entity key and keeps colons inside the slug", () => {
		expect(parseViewKey("item:A0:01")).toEqual({
			type: "entity",
			kind: "item",
			slug: "A0:01",
		});
	});
	it("refuses inherited object keys as page modules", () => {
		expect(parseViewKey("page:constructor")).toBeUndefined();
		expect(parseViewKey("page:__proto__")).toBeUndefined();
	});
	it("refuses a slug longer than 64 characters", () => {
		expect(parseViewKey(`event:${"x".repeat(65)}`)).toBeUndefined();
	});
});

describe("pageViewKey", () => {
	it("makes the key parseViewKey reads back", () => {
		expect(pageViewKey("events")).toBe("page:events");
		expect(parseViewKey(pageViewKey("events"))).toEqual({
			type: "page",
			moduleId: "events",
		});
	});
});

describe("totalViews", () => {
	it("adds every role, zero for no views", () => {
		expect(totalViews({ members: 3, board: 2, guests: 1 })).toBe(6);
		expect(totalViews(NO_VIEWS)).toBe(0);
	});
});

describe("bucketOf", () => {
	it("puts each tier in its bucket", () => {
		expect(bucketOf("member")).toBe("members");
		expect(bucketOf("core")).toBe("members");
		expect(bucketOf("staff")).toBe("members");
		expect(bucketOf("board")).toBe("board");
		expect(bucketOf("admin")).toBe("board");
		expect(bucketOf("guest")).toBe("guests");
	});
});

describe("shiftDay", () => {
	it("moves across a month and a year", () => {
		expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
		expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
	});
});

describe("buildSummary", () => {
	it("fills empty days, totals by role, ranks pages and entities apart", () => {
		const summary = buildSummary(
			[
				row("2026-11-01", "page:events", 3),
				row("2026-11-03", "page:events", 1),
				row("2026-11-03", "event:e1", 5),
				{
					...row("2026-11-03", "perk:p1", 0),
					board: 2,
				},
			],
			"2026-11-01",
			"2026-11-03",
			10
		);
		expect(summary.daily.map((day) => day.date)).toEqual([
			"2026-11-01",
			"2026-11-02",
			"2026-11-03",
		]);
		expect(summary.daily[1]).toEqual({
			date: "2026-11-02",
			members: 0,
			board: 0,
			guests: 0,
		});
		expect(summary.totals).toEqual({ members: 9, board: 2, guests: 0 });
		expect(summary.pages).toEqual([{ key: "page:events", count: 4 }]);
		expect(summary.entities).toEqual([
			{ key: "event:e1", count: 5 },
			{ key: "perk:p1", count: 2 },
		]);
	});
	it("breaks equal counts by key, counts guests, skips rows outside the range", () => {
		const summary = buildSummary(
			[
				row("2026-11-01", "event:b", 1),
				row("2026-11-01", "event:a", 1),
				{ ...row("2026-11-01", "page:events", 0), guests: 3 },
				row("2026-10-31", "event:out", 9),
				row("2026-11-02", "event:out", 9),
			],
			"2026-11-01",
			"2026-11-01",
			10
		);
		expect(summary.entities.map((view) => view.key)).toEqual([
			"event:a",
			"event:b",
		]);
		expect(summary.totals).toEqual({ members: 2, board: 0, guests: 3 });
	});
	it("adds a key's days together and cuts to top", () => {
		const summary = buildSummary(
			[
				row("2026-11-01", "event:e1", 1),
				row("2026-11-02", "event:e1", 1),
				row("2026-11-02", "event:e2", 1),
			],
			"2026-11-01",
			"2026-11-02",
			1
		);
		expect(summary.entities).toEqual([{ key: "event:e1", count: 2 }]);
	});
});

describe("mergeToday", () => {
	it("adds today's counts onto past keys and drops days before from", () => {
		const past = buildSummary(
			[
				row("2026-11-01", "event:e1", 2),
				row("2026-11-02", "event:e1", 1),
			],
			"2026-11-01",
			"2026-11-02",
			50
		);
		const merged = mergeToday({
			past,
			today: [
				row("2026-11-03", "event:e1", 4),
				row("2026-11-03", "page:perks", 1),
			],
			from: "2026-11-02",
			todayDay: "2026-11-03",
			top: 10,
		});
		expect(merged.daily.map((day) => day.date)).toEqual([
			"2026-11-02",
			"2026-11-03",
		]);
		expect(merged.entities).toEqual([{ key: "event:e1", count: 7 }]);
		expect(merged.pages).toEqual([{ key: "page:perks", count: 1 }]);
		expect(merged.totals).toEqual({ members: 6, board: 0, guests: 0 });
	});
	it("works with no snapshot yet", () => {
		const merged = mergeToday({
			past: undefined,
			today: [row("2026-11-03", "page:events", 1)],
			from: "2026-11-01",
			todayDay: "2026-11-03",
			top: 10,
		});
		expect(merged.daily).toHaveLength(3);
		expect(merged.totals.members).toBe(1);
	});
});

describe("sha256HexOfText", () => {
	it("matches the known SHA-256 of abc", async () => {
		expect(await sha256HexOfText("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	});
	it("hashes to 64 hex characters, deterministically", async () => {
		const first = await sha256HexOfText("salt:person");
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(await sha256HexOfText("salt:person")).toBe(first);
	});
});

describe("randomHex", () => {
	it("gives two hex characters per byte, different each call", () => {
		const first = randomHex(32);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(randomHex(32)).not.toBe(first);
	});
});
