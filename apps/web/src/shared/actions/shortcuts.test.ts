import { expect, test } from "vitest";

import { claimKeys, type ActionDescriptor } from "./shortcuts.ts";

function stub(
	id: string,
	hotkey: "D" | "G"
): ActionDescriptor<{ _id: string }> {
	return {
		id,
		label: id,
		icon: "close",
		hotkey,
		can: () => true,
		run: () => {},
	};
}

test("two actions in one scope claiming a letter is an error", () => {
	expect(() => {
		claimKeys("applications", [stub("deny", "D"), stub("dismiss", "D")]);
	}).toThrow(/applications.*D/);
});

test("two bindings sharing a scope cannot claim one letter for two actions", () => {
	const release = claimKeys("task-sheet", [stub("delete", "D")]);
	expect(() => {
		claimKeys("task-sheet", [stub("duplicate", "D")]);
	}).toThrow(/task-sheet.*D/);
	release();
	expect(() => {
		claimKeys("task-sheet", [stub("duplicate", "D")])();
	}).not.toThrow();
});

test("the same action bound twice in a scope (a sheet mounted twice) is fine", () => {
	const first = claimKeys("event-sheet", [stub("delete", "D")]);
	const second = claimKeys("event-sheet", [stub("delete", "D")]);
	first();
	// Still held by the second binding.
	expect(() => {
		claimKeys("event-sheet", [stub("duplicate", "D")]);
	}).toThrow();
	second();
});

test("the same letter in different scopes is fine", () => {
	expect(() => {
		claimKeys("applications", [stub("deny", "D")])();
		claimKeys("members", [stub("demote", "D")])();
	}).not.toThrow();
});
