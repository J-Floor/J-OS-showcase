import { expect, test } from "vitest";

import type { PerkRow } from "../../../convex/perks.ts";

import { visiblePerks } from "./visiblePerks.ts";

// 11:00 in Zurich on 29 October 2026.
const NOW = Date.UTC(2026, 9, 29, 10);

function perk(title: string, validUntil?: string): PerkRow {
	return {
		_id: title,
		_creationTime: 0,
		partner: "Alpha Labs",
		title,
		terms: "Ask the board for the code.",
		category: "cloud",
		createdAt: 0,
		validUntil,
	} as PerkRow;
}

const openEnded = perk("open-ended");
const lastDay = perk("last-day", "2026-10-29");
const expired = perk("expired", "2026-10-28");
const longGone = perk("long-gone", "2020-01-31");
const rows = [openEnded, expired, lastDay, longGone];

// No open request on any perk.
const none: ReadonlySet<string> = new Set();

function titles(visible: PerkRow[]): string[] {
	return visible.map((row) => row.title);
}

test("anyone but the board sees only the perks they can still request", () => {
	expect(titles(visiblePerks(rows, false, NOW, none))).toEqual([
		"open-ended",
		"last-day",
	]);
});

test("a member keeps an expired perk in view only while their request on it is open", () => {
	// `perk` uses the title as the id.
	expect(
		titles(visiblePerks(rows, false, NOW, new Set(["expired", "last-day"])))
	).toEqual(["open-ended", "expired", "last-day"]);
});

test("the board sees every perk, expired ones included, open requests or not", () => {
	const all = ["open-ended", "expired", "last-day", "long-gone"];
	expect(titles(visiblePerks(rows, true, NOW, none))).toEqual(all);
	expect(titles(visiblePerks(rows, true, NOW, new Set(["expired"])))).toEqual(
		all
	);
});
