import { expect, test } from "vitest";

import { assertNoCollisions, type ActionDescriptor } from "./shortcuts.ts";

function stub(
	id: string,
	hotkey: "D" | "G" | "M",
	scope: "applications" | "members"
): ActionDescriptor<{ _id: string }> {
	return {
		id,
		label: id,
		icon: "close",
		hotkey,
		scope,
		can: () => true,
		run: () => undefined,
	};
}

test("two actions in one scope claiming a letter is an error", () => {
	expect(() => {
		assertNoCollisions([
			stub("deny", "D", "applications"),
			stub("dismiss", "D", "applications"),
		]);
	}).toThrow(/applications.*D/);
});

test("the same letter in different scopes is fine", () => {
	expect(() => {
		assertNoCollisions([
			stub("deny", "D", "applications"),
			stub("demote", "D", "members"),
		]);
	}).not.toThrow();
});
