import { describe, expect, it } from "vitest";

import {
	isOnAt,
	nextChange,
	parseSchedule,
	type Schedule,
} from "./schedule.ts";

const XML =
	'<schedule version="3"><day name="mon" on="08:00" off="22:00"/><day name="sat" off="all"/></schedule>';

// 2026-11-23 is a Monday, 2026-11-28 a Saturday, 2026-11-29 a Sunday.
function at(day: number, hour: number, minute = 0): Date {
	return new Date(2026, 10, day, hour, minute);
}

function parsed(xml: string): Schedule {
	const schedule = parseSchedule(xml);
	if (!schedule) throw new Error("expected a schedule");
	return schedule;
}

describe("parseSchedule", () => {
	it("reads days by Date#getDay index", () => {
		const schedule = parsed(XML);
		expect(schedule).toHaveLength(7);
		expect(schedule[1]).toEqual({
			closed: false,
			onMinute: 480,
			offMinute: 1320,
		});
		expect(schedule[6]).toEqual({ closed: true });
		expect(schedule[0]).toBeUndefined();
	});

	it("refuses what it cannot trust", () => {
		expect(parseSchedule("not xml")).toBeUndefined();
		expect(parseSchedule("<tv/>")).toBeUndefined();
		expect(parseSchedule("<schedule><week/></schedule>")).toBeUndefined();
		expect(
			parseSchedule(
				'<schedule><day name="mon" on="22:00" off="08:00"/></schedule>'
			)
		).toBeUndefined();
		expect(
			parseSchedule(
				'<schedule><day name="mon" on="08:00" off="08:00"/></schedule>'
			)
		).toBeUndefined();
		expect(
			parseSchedule(
				'<schedule><day name="mon" on="8am" off="22:00"/></schedule>'
			)
		).toBeUndefined();
		expect(
			parseSchedule(
				'<schedule><day name="mon" on="08:00" off="25:00"/></schedule>'
			)
		).toBeUndefined();
		expect(
			parseSchedule('<schedule><day name="xyz" off="all"/></schedule>')
		).toBeUndefined();
		expect(
			parseSchedule(
				'<schedule><day name="mon" off="all"/><day name="mon" off="all"/></schedule>'
			)
		).toBeUndefined();
		// An empty document has no root element: refuse it, do not throw.
		expect(parseSchedule("")).toBeUndefined();
		// A day that is closed ignores any on time; it still parses as closed.
		expect(
			parseSchedule(
				'<schedule><day name="mon" on="08:00" off="all"/></schedule>'
			)?.[1]
		).toEqual({ closed: true });
		// The cap counts UTF-16 chars (String#length), not bytes.
		const big = `<schedule>${" ".repeat(17 * 1024)}</schedule>`;
		expect(parseSchedule(big)).toBeUndefined();
	});
});

describe("isOnAt", () => {
	const schedule = parsed(XML);

	it("follows the day's window", () => {
		expect(isOnAt(schedule, at(23, 7, 59))).toBe(false);
		expect(isOnAt(schedule, at(23, 8))).toBe(true);
		expect(isOnAt(schedule, at(23, 21, 59))).toBe(true);
		expect(isOnAt(schedule, at(23, 22))).toBe(false);
	});

	it("is off all day when closed", () => {
		expect(isOnAt(schedule, at(28, 0))).toBe(false);
		expect(isOnAt(schedule, at(28, 12))).toBe(false);
		expect(isOnAt(schedule, at(28, 23, 59))).toBe(false);
	});

	it("is on for a day without an entry and for an empty schedule", () => {
		expect(isOnAt(schedule, at(24, 3))).toBe(true);
		expect(isOnAt([], at(23, 3))).toBe(true);
	});
});

describe("nextChange", () => {
	const monOnly: Schedule = [
		undefined,
		{ closed: false, onMinute: 480, offMinute: 1320 },
	];

	it("is undefined when nothing ever flips", () => {
		expect(nextChange([], at(23, 23))).toBeUndefined();
		expect(
			nextChange([undefined, { closed: false }], at(23, 23))
		).toBeUndefined();
	});

	it("returns to on at midnight after the window closed", () => {
		expect(nextChange(monOnly, at(23, 23))).toBe(at(24, 0).getTime());
	});

	it("finds the next off", () => {
		expect(nextChange(monOnly, at(23, 21))).toBe(at(23, 22).getTime());
	});

	it("finds midnight after a closed day", () => {
		const schedule = parsed(XML);
		expect(nextChange(schedule, at(28, 10))).toBe(at(29, 0).getTime());
	});

	it("keeps wall-clock times across a DST change", () => {
		// vite.config.ts pins TZ=Europe/Berlin: Sunday 2026-03-29 is its spring-forward day (CET to CEST at 01:00 UTC).
		expect(new Date(2026, 2, 28, 12, 0).getTimezoneOffset()).toBe(-60);
		expect(new Date(2026, 2, 29, 12, 0).getTimezoneOffset()).toBe(-120);
		const schedule: Schedule = [
			{ closed: false, onMinute: 480, offMinute: 1320 },
			...Array<undefined>(6).fill(undefined),
		];
		const from = new Date(2026, 2, 28, 12, 0);
		expect(nextChange(schedule, from)).toBe(
			Date.UTC(2026, 2, 28, 23, 0) // Sunday 00:00 CET
		);
		const evening = new Date(2026, 2, 29, 9, 0);
		expect(nextChange(schedule, evening)).toBe(
			Date.UTC(2026, 2, 29, 20, 0) // 22:00 CEST
		);
		const before = new Date(2026, 2, 29, 7, 0);
		expect(nextChange(schedule, before)).toBe(
			Date.UTC(2026, 2, 29, 6, 0) // 08:00 CEST
		);
		// Sunday 23:00 CEST: Sunday's window is over, so the next flip is Monday 00:00 CEST.
		const afterOff = new Date(2026, 2, 29, 23, 0);
		expect(nextChange(schedule, afterOff)).toBe(
			Date.UTC(2026, 2, 29, 22, 0)
		);
	});
});
