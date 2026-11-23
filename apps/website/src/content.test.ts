import { describe, expect, it } from "vitest";

import {
	eventGroups,
	events,
	eventState,
	eventTime,
	type HouseEvent,
} from "./content.ts";

const now = Date.parse("2026-11-15T12:00:00Z");
describe("event publishing", () => {
	it("sorts upcoming and recent gatherings independently of input order", () => {
		const grouped = eventGroups([...events].reverse(), now);
		expect(grouped.upcoming.map((item) => item.title)).toEqual([
			"Builders evening",
			"Work in progress",
			"Around the table",
		]);
		expect(grouped.recent.map((item) => item.title)).toEqual([
			"An idea becomes a conversation",
			"Show what you’re building",
		]);
	});
	it("does not offer registrations for sold-out, cancelled, or completed events", () => {
		const event: HouseEvent = { ...events[0], status: "cancelled" };
		expect(eventState(event, now)).toBe("Cancelled");
		expect(eventState(events[1], now)).toBe("Sold out");
		expect(eventState(events[0], Date.parse("2027-01-01"))).toBe(
			"Past event"
		);
		expect(eventGroups(events, Date.parse("2027-01-01")).upcoming).toEqual(
			[]
		);
	});
	it("keeps all sample destinations reserved and all entries explicitly labelled", () => {
		for (const event of events) {
			expect(event.sample).toBe(true);
			for (const url of [event.registration, event.recap].filter(Boolean))
				expect(new URL(url!).hostname).toBe("example.com");
			expect(Date.parse(event.end)).toBeGreaterThan(
				Date.parse(event.start)
			);
		}
	});
	it("uses Zurich time across daylight-saving boundaries", () => {
		expect(eventTime("2026-07-01T16:00:00Z")).toBe("18:00");
		expect(eventTime("2026-12-01T16:00:00Z")).toBe("17:00");
	});
});
