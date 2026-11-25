import { describe, expect, it } from "vitest";

import { scheduleToXml, validateSchedule } from "./schedule.ts";

describe("validateSchedule", () => {
	it("accepts open and closed days and sorts them", () => {
		const result = validateSchedule([
			{ day: "sat", closed: true },
			{ day: "mon", closed: false, on: "08:00", off: "22:00" },
		]);
		expect(result._unsafeUnwrap().map((day) => day.day)).toEqual([
			"mon",
			"sat",
		]);
	});

	it.each([
		[
			[{ day: "mon", closed: false, on: "22:00", off: "08:00" }],
			"mon: on must be before off",
		],
		[
			[{ day: "mon", closed: false, on: "08:00", off: "08:00" }],
			"mon: on must be before off",
		],
		[
			[{ day: "mon", closed: false, on: "8:00", off: "22:00" }],
			"mon: times look like 08:00",
		],
		[
			[{ day: "mon", closed: false, on: "08:00", off: "24:00" }],
			"mon: times look like 08:00",
		],
		[
			[{ day: "mon", closed: false, on: "08:00" }],
			"mon: set both on and off",
		],
		[
			[{ day: "mon", closed: false, off: "22:00" }],
			"mon: set both on and off",
		],
		[
			[{ day: "mon", closed: true, on: "08:00", off: "22:00" }],
			"mon: a closed day has no times",
		],
		[
			[{ day: "mon", closed: true, off: "22:00" }],
			"mon: a closed day has no times",
		],
		[[{ day: "xxx", closed: true }], "xxx is not a weekday"],
		[
			[
				{ day: "mon", closed: true },
				{ day: "mon", closed: true },
			],
			"mon appears twice",
		],
	])("rejects %j", (days, message) => {
		const result = validateSchedule(days as never);
		expect(result._unsafeUnwrapErr().message).toBe(message);
	});
});

describe("scheduleToXml", () => {
	it("writes one element per day", () => {
		expect(
			scheduleToXml(3, [
				{ day: "mon", closed: false, on: "08:00", off: "22:00" },
				{ day: "sat", closed: true },
			])
		).toBe(
			'<schedule version="3"><day name="mon" on="08:00" off="22:00"/><day name="sat" off="all"/></schedule>'
		);
	});
});
