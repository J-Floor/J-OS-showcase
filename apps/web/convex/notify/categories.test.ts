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
		const all = ["events", "applications", "doors", "guests", "tasks"];
		expect(categoriesForTier("board")).toEqual(all);
		expect(categoriesForTier("admin")).toEqual(all);
		expect(categoriesForTier("core")).toEqual(["events", "tasks"]);
		expect(categoriesForTier("member")).toEqual(["events"]);
		expect(categoriesForTier("guest")).toEqual(["events", "guests"]);
		expect(categoriesForTier("prospect")).toEqual([]);
		expect(categoriesForTier("visitor")).toEqual([]);
		expect(categoriesForTier("former")).toEqual([]);
	});

	it("keeps the validator in step with the category list", () => {
		expect(categoryValidator.members.map((m) => m.value)).toEqual([
			...CATEGORIES,
		]);
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
});
