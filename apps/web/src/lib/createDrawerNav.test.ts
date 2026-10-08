import { describe, expect, it } from "vitest";

import { createDrawerNav } from "./createDrawerNav.ts";

const items = [{ _id: "a" }, { _id: "b" }, { _id: "c" }];

describe("createDrawerNav", () => {
	it("computes ends-disabled and moves selection", () => {
		// A plain mutable variable (not a signal) stands in for the selection:
		// createDrawerNav reads currentId() fresh on every call, so the test
		// observes navigation without needing a tracked reactive scope.
		let current: string | undefined = "a";
		const nav = createDrawerNav({
			items: () => items,
			currentId: () => current,
			onSelect: (i) => {
				current = i._id;
			},
		});
		expect(nav.hasPrev()).toBe(false);
		expect(nav.hasNext()).toBe(true);
		nav.next();
		expect(current).toBe("b");
		expect(nav.hasPrev()).toBe(true);
		expect(nav.hasNext()).toBe(true);
		nav.next();
		expect(current).toBe("c");
		expect(nav.hasNext()).toBe(false);
		nav.prev();
		expect(current).toBe("b");
	});

	it("disables both and no-ops when the current id is not in the list", () => {
		const nav = createDrawerNav({
			items: () => items,
			currentId: () => "zzz",
			onSelect: () => {
				throw new Error("should not select");
			},
		});
		expect(nav.hasPrev()).toBe(false);
		expect(nav.hasNext()).toBe(false);
		nav.prev();
		nav.next();
	});
});
