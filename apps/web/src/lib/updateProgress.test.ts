import { describe, expect, it } from "vitest";

import {
	precacheProgressMessage,
	readPrecacheProgress,
} from "./updateProgress.ts";

describe("readPrecacheProgress", () => {
	it("reads a message built by precacheProgressMessage", () => {
		expect(
			readPrecacheProgress(precacheProgressMessage({ done: 2, total: 5 }))
		).toEqual({ done: 2, total: 5 });
	});

	it.each([
		null,
		"precache-progress",
		{ type: "other", done: 1, total: 2 },
		{ type: "precache-progress", done: "1", total: 2 },
		{ type: "precache-progress", done: 3, total: 2 },
		{ type: "precache-progress", done: -1, total: 2 },
		{ type: "precache-progress", done: 1.5, total: 2 },
	])("ignores %j", (data) => {
		expect(readPrecacheProgress(data)).toBeUndefined();
	});
});
