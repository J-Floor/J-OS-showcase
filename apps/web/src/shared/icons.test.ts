import { ICONS as UI_ICONS } from "@j-os/design-system/icons";
import { expect, test } from "vitest";

import { ICONS } from "./icons.ts";

test("the app map keeps every design-system icon unchanged", () => {
	for (const [key, value] of Object.entries(UI_ICONS))
		expect(ICONS[key as keyof typeof ICONS]).toBe(value);
});

test("unlock is the open-shackle icon, distinct from lock", () => {
	expect(ICONS.unlock).toBe("lock_open_right");
	expect(ICONS.unlock).not.toBe(ICONS.lock);
});

test("name is not role", () => {
	expect(ICONS.name).not.toBe(ICONS.role);
});
