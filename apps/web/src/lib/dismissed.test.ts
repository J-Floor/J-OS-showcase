// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from "vitest";

import { createDismissed } from "./dismissed.ts";

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

test("starts undismissed and persists a dismissal under the key", () => {
	const [dismissed, dismiss] = createDismissed("k");
	expect(dismissed()).toBe(false);
	dismiss();
	expect(dismissed()).toBe(true);
	expect(localStorage.getItem("k")).toBe("1");
	expect(createDismissed("k")[0]()).toBe(true);
});

test("tolerates blocked storage", () => {
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("blocked");
	});
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("blocked");
	});
	const [dismissed, dismiss] = createDismissed("k");
	expect(dismissed()).toBe(false);
	dismiss();
	expect(dismissed()).toBe(true);
});
