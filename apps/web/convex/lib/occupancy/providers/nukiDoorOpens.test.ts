import { expect, test } from "vitest";

import {
	DOOR_OPENED_ACTION,
	countDoorOpens,
	isDoorOpened,
	startOfTodayIso,
} from "./nukiDoorOpens.ts";

test("isDoorOpened matches only the door-opened action", () => {
	expect(isDoorOpened({ action: DOOR_OPENED_ACTION })).toBe(true);
	expect(isDoorOpened({ action: 1 })).toBe(false); // 1 = unlock — ignored
});

test("countDoorOpens counts door-opened entries, ignoring unlocks", () => {
	const entries = [
		{ action: DOOR_OPENED_ACTION },
		{ action: 1 }, // unlock
		{ action: DOOR_OPENED_ACTION },
		{ action: 2 }, // lock
	];
	expect(countDoorOpens(entries)).toBe(2);
});

test("startOfTodayIso is midnight in the site timezone", () => {
	expect(startOfTodayIso(Date.parse("2026-10-04T05:00:00Z"))).toBe(
		"2026-10-03T22:00:00.000Z"
	);
});
