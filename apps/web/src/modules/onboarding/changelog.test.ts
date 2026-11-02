import { expect, test } from "vitest";

import { defineAbilityFor, type Role } from "../../lib/ability.tsx";

import { CHANGELOG, type ChangeEntry, visibleNotes } from "./changelog.ts";

const EVERYONE = { text: "For everyone" };
const BOARD = {
	text: "Board only",
	audience: { action: "manage", subject: "Space" },
} as const;

const ENTRIES: ChangeEntry[] = [
	{ version: "1.3", title: "Three", items: [EVERYONE, BOARD] },
	{ version: "1.2", title: "Two", items: [BOARD] },
	{ version: "1.1", title: "One", items: [EVERYONE] },
];

const boardAbility = defineAbilityFor("board");
const memberAbility = defineAbilityFor("member");

function versions(entries: ChangeEntry[]): string[] {
	return entries.map((entry) => entry.version);
}

test("a board-only item is hidden when the check fails and shown when it passes", () => {
	expect(visibleNotes(ENTRIES, null, memberAbility)[0].items).toEqual([
		EVERYONE,
	]);
	expect(visibleNotes(ENTRIES, null, boardAbility)[0].items).toEqual([
		EVERYONE,
		BOARD,
	]);
});

test("an item is gated on its own action and subject", () => {
	const viewOnly = defineAbilityFor("core");
	expect(viewOnly.can("view", "Space")).toBe(true);
	expect(viewOnly.can("manage", "Space")).toBe(false);
	expect(visibleNotes(ENTRIES, "1.1", viewOnly)[0].items).toEqual([EVERYONE]);
});

test("a version whose items are all hidden is dropped", () => {
	expect(versions(visibleNotes(ENTRIES, null, memberAbility))).toEqual([
		"1.3",
		"1.1",
	]);
});

test("versions not newer than the seen one are dropped", () => {
	expect(versions(visibleNotes(ENTRIES, "1.2", boardAbility))).toEqual([
		"1.3",
	]);
	expect(visibleNotes(ENTRIES, "1.3", boardAbility)).toEqual([]);
});

test("the perks release offers browsing to the community and tracking to the board", () => {
	const browse = "Browse partner perks and request one from the app.";
	const track = "Track perk requests from requested to granted.";
	const release = CHANGELOG.filter((entry) =>
		entry.items.some((item) => item.text === browse)
	);
	expect(release.map((entry) => entry.version)).toEqual(["1.4"]);
	function textsFor(role: Role): string[] {
		return visibleNotes(release, null, defineAbilityFor(role)).flatMap(
			(entry) => entry.items.map((item) => item.text)
		);
	}
	expect(textsFor("guest")).toEqual([browse]);
	expect(textsFor("member")).toEqual([browse]);
	expect(textsFor("board")).toEqual([browse, track]);
	expect(textsFor("admin")).toEqual([browse, track]);
	expect(textsFor("staff")).toEqual([]);
});

test("perk notifications are announced to everyone who can view Perks", () => {
	const text =
		"Get told when a perk is added, when your request is answered, and a week before a perk ends.";
	const release = CHANGELOG.filter((entry) =>
		entry.items.some((item) => item.text === text)
	);
	expect(release.map((entry) => entry.version)).toEqual([
		CHANGELOG[0].version,
	]);
	for (const role of ["guest", "member", "core", "board", "admin"] as const) {
		expect(
			visibleNotes(release, null, defineAbilityFor(role)).flatMap(
				(entry) => entry.items.map((item) => item.text)
			),
			role
		).toContain(text);
	}
	expect(visibleNotes(release, null, defineAbilityFor("staff"))).toEqual([]);
});
