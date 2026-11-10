import { describe, expect, it } from "vitest";

import {
	CATEGORIES,
	categoriesForTier,
	CATEGORY_INFO,
	categoryValidator,
	prefFor,
} from "./categories.ts";

describe("notification categories", () => {
	it("defaults every category to push and email on", () => {
		for (const category of CATEGORIES) {
			expect(prefFor(undefined, category)).toEqual({
				push: true,
				email: true,
			});
		}
	});

	it("uses a stored preference and leaves the other categories at the default", () => {
		const prefs = { doors: { push: false, email: true } };
		expect(prefFor(prefs, "doors")).toEqual({ push: false, email: true });
		expect(prefFor(prefs, "tasks")).toEqual({ push: true, email: true });
	});

	it("gives staff no notification categories", () => {
		expect(categoriesForTier("staff")).toEqual([]);
	});

	it("offers each tier only the categories it can receive", () => {
		const all = [
			"events",
			"applications",
			"doors",
			"guests",
			"tasks",
			"perks",
			"perkUpdates",
		];
		expect(categoriesForTier("board")).toEqual(all);
		expect(categoriesForTier("admin")).toEqual(all);
		expect(categoriesForTier("core")).toEqual([
			"events",
			"tasks",
			"perkUpdates",
		]);
		expect(categoriesForTier("member")).toEqual(["events", "perkUpdates"]);
		expect(categoriesForTier("guest")).toEqual([
			"events",
			"guests",
			"perkUpdates",
		]);
		expect(categoriesForTier("prospect")).toEqual([]);
		expect(categoriesForTier("visitor")).toEqual([]);
		expect(categoriesForTier("former")).toEqual([]);
	});

	it("keeps the validator in step with the category list", () => {
		expect(categoryValidator.members.map((member) => member.value)).toEqual(
			[...CATEGORIES]
		);
	});

	it("marks only events as push only", () => {
		expect(CATEGORY_INFO.events.pushOnly).toBe(true);
		expect(CATEGORY_INFO.events.note).toBe(
			"Event reminders are push only."
		);
		for (const category of CATEGORIES) {
			if (category !== "events") {
				expect(CATEGORY_INFO[category].pushOnly).toBeUndefined();
			}
		}
	});

	it("offers perk requests to board and admin only", () => {
		expect(CATEGORY_INFO.perks).toEqual({
			label: "Perk requests",
			description: "Someone requests a perk you're the contact for.",
			tiers: ["board", "admin"],
			note: "Requests are emailed as one daily summary.",
		});
		for (const tier of ["guest", "member", "core", "staff"] as const) {
			expect(categoriesForTier(tier)).not.toContain("perks");
		}
	});

	it("offers perk updates to everyone who can view Perks", () => {
		expect(CATEGORY_INFO.perkUpdates).toEqual({
			label: "Perks",
			description:
				"A perk is added, your request is answered, or a perk ends in a week.",
			tiers: ["guest", "member", "core", "board", "admin"],
			note: "New and ending perks are emailed as one daily summary.",
		});
		expect(categoriesForTier("staff")).not.toContain("perkUpdates");
	});
});
