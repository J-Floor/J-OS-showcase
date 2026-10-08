// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { defineAbilityFor } from "./ability.tsx";

test("board can manage Tasks; member cannot view", () => {
	expect(defineAbilityFor("board").can("manage", "Tasks")).toBe(true);
	expect(defineAbilityFor("admin").can("manage", "Tasks")).toBe(true);
	expect(defineAbilityFor("member").can("view", "Tasks")).toBe(false);
	expect(defineAbilityFor("guest").can("view", "Tasks")).toBe(false);
});

test("members and guests can view Community (read-only) but not manage it", () => {
	for (const role of ["member", "core", "guest"] as const) {
		expect(defineAbilityFor(role).can("view", "Community")).toBe(true);
		// Triage tabs stay board-only.
		expect(defineAbilityFor(role).can("view", "Applications")).toBe(false);
		expect(defineAbilityFor(role).can("manage", "Community")).toBe(false);
	}
	// A prospect (no access, reads as role "none") still can't view it.
	expect(defineAbilityFor("none").can("view", "Community")).toBe(false);
});

test("board can create/manage Events; member and guest can only view", () => {
	expect(defineAbilityFor("board").can("create", "Events")).toBe(true);
	expect(defineAbilityFor("admin").can("create", "Events")).toBe(true);
	expect(defineAbilityFor("board").can("manage", "Events")).toBe(true);
	expect(defineAbilityFor("member").can("create", "Events")).toBe(false);
	expect(defineAbilityFor("guest").can("create", "Events")).toBe(false);
	expect(defineAbilityFor("member").can("view", "Events")).toBe(true);
	expect(defineAbilityFor("guest").can("view", "Events")).toBe(true);
});

test("board can manage Space; member cannot", () => {
	expect(defineAbilityFor("board").can("manage", "Space")).toBe(true);
	expect(defineAbilityFor("admin").can("manage", "Space")).toBe(true);
	expect(defineAbilityFor("member").can("manage", "Space")).toBe(false);
});

test("board can view Inventory; member, guest, and core cannot", () => {
	expect(defineAbilityFor("board").can("view", "Inventory")).toBe(true);
	expect(defineAbilityFor("admin").can("manage", "Inventory")).toBe(true);
	expect(defineAbilityFor("member").can("view", "Inventory")).toBe(false);
	expect(defineAbilityFor("guest").can("view", "Inventory")).toBe(false);
	expect(defineAbilityFor("core").can("view", "Inventory")).toBe(false);
});

test("staff sees Space and Community, nothing else", () => {
	const a = defineAbilityFor("staff");
	expect(a.can("view", "Space")).toBe(true);
	expect(a.can("view", "Community")).toBe(true);
	expect(a.can("view", "SpaceInfo")).toBe(false);
	expect(a.can("view", "Events")).toBe(false);
	expect(a.can("view", "Notifications")).toBe(false);
	expect(a.can("view", "Tasks")).toBe(false);
	expect(a.can("view", "Applications")).toBe(false);
});

test("members still see the space info", () => {
	expect(defineAbilityFor("member").can("view", "SpaceInfo")).toBe(true);
});

test("every community role gets notifications; no role, none", () => {
	for (const role of ["guest", "member", "core", "board", "admin"] as const)
		expect(defineAbilityFor(role).can("view", "Notifications")).toBe(true);
	expect(defineAbilityFor("none").can("view", "Notifications")).toBe(false);
	expect(defineAbilityFor("none").can("view", "Space")).toBe(false);
});
