import { expect, test } from "vitest";

import { ICONS } from "./icons.ts";

test("back is arrow_back and close is close", () => {
	expect(ICONS.back).toBe("arrow_back");
	expect(ICONS.close).toBe("close");
});

test("no two generic meanings share a ligature", () => {
	const values = Object.values(ICONS);
	expect(new Set(values).size).toBe(values.length);
});
