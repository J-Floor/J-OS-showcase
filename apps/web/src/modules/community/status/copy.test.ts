// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { ICONS } from "../../../shared/icons.ts";

import {
	FLAG_FILTER_OPTIONS,
	factLine,
	flagFilterValue,
	flagLabel,
	headline,
} from "./copy.ts";

// `factLine` renders the access-until day in the SITE zone (Europe/Zurich) via
// `guestChosenIso`, not the runtime's zone. The fixtures below straddle the
// UTC/Zurich day boundary on purpose, so a browser-zone regression would show a
// different day and the assertions would catch it.

describe("the door line", () => {
	it("says the override never ends, not merely who set it", () => {
		// "Allowed — forced by X" named the actor and hid the cost: the
		// override does not expire, so the person keeps getting in after their
		// membership ends until somebody notices.
		expect(
			factLine({
				id: "door",
				state: "forced_open",
				actorName: "J Floor Admin",
			}).value
		).toBe("Allowed forever (J Floor Admin)");
	});

	it("falls back to the board when it does not know who did it", () => {
		expect(factLine({ id: "door", state: "forced_open" }).value).toBe(
			"Allowed forever (the board)"
		);
	});

	it("words the flag the same way the drawer line does", () => {
		// The table and the drawer must never describe the same override
		// differently — that is how a board member ends up believing they are
		// two separate situations.
		expect(
			flagLabel({ id: "door_forced_open", actorName: "J Floor Admin" })
		).toBe("Door access always on (J Floor Admin)");
	});
});

describe("the access-until line", () => {
	it("is labelled for what it is, and carries no tone", () => {
		// 23:30 UTC on the 15th is already the 16th in Zurich; an absent
		// `local` shows the epoch's OWN Zurich day (the 16th), proving it does
		// not fall back to the browser/UTC day (the 15th).
		const line = factLine({
			id: "access_until",
			at: Date.UTC(2027, 0, 15, 23, 30),
		});
		expect(line.label).toBe("Access until");
		expect(line.value).toBe("16 Jan 2027");
		// The State line already says "Expired" once this date has passed;
		// colouring both makes one expiry look like two problems.
		expect(line.tone).toBeUndefined();
	});

	it("shows the chosen day (day before) for a Model-B end-of-day expiry", () => {
		// A 00:00:01 Zurich instant is the exclusive end of the PREVIOUS day —
		// "until the 15th" is stored as the 16th 00:00:01, and must read as the
		// 15th.
		const line = factLine({
			id: "access_until",
			at: Date.parse("2027-01-16T00:00:01+01:00"),
			local: "2027-01-16T00:00:01+01:00[Europe/Zurich]",
		});
		expect(line.value).toBe("15 Jan 2027");
	});

	it("shows its own day for a preserved arbitrary legacy/seed instant", () => {
		// Not the 00:00:01 end-of-day encoding, so no day-before inverse — the
		// stored instant's own Zurich day is what it means.
		const line = factLine({
			id: "access_until",
			at: Date.parse("2027-01-16T14:23:00+01:00"),
			local: "2027-01-16T14:23:00+01:00[Europe/Zurich]",
		});
		expect(line.value).toBe("16 Jan 2027");
	});
});

describe("tier wording", () => {
	it("calls the pre-approval tier what the board calls it", () => {
		// The machine's word is `prospect`; the board's is "applicant", which is
		// also the name of the tab these people sit under. The stored value is
		// untouched — this module is where the two are allowed to differ.
		expect(
			headline({
				tier: "prospect",
				stage: "queued",
				tone: "info",
				flags: [],
				facts: [],
				boardTasks: [],
				sinceDays: 0,
			})
		).toBe("Applicant · In queue");
	});
});

describe("the state-since line", () => {
	it("says what it dates, rather than leaving it to the layout", () => {
		// "Since" alone did not say since what. It always sits directly under
		// "State", and that is what it dates.
		const line = factLine({ id: "since", days: 3 });
		expect(line.label).toBe("State since");
		// A point in time, not a duration: "3 days" would not read as an answer
		// to "since when".
		expect(line.value).toBe("3 days ago");
	});

	it("words today and yesterday rather than counting them", () => {
		expect(factLine({ id: "since", days: 0 }).value).toBe("Today");
		expect(factLine({ id: "since", days: 1 }).value).toBe("Yesterday");
	});
});

describe("the agreement line", () => {
	it("uses the shared agreement icon", () => {
		expect(factLine({ id: "agreement", state: "signed" }).icon).toBe(
			ICONS.agreement
		);
	});
});

describe("Flags column filter", () => {
	it("offers each board step under the exact words its row flag shows", () => {
		const flag = { id: "board_task_pending", step: "whatsapp" } as const;
		expect(FLAG_FILTER_OPTIONS).toContainEqual({
			value: flagFilterValue(flag),
			label: flagLabel(flag),
		});
		expect(flagLabel(flag)).toBe("Not added to WhatsApp group");
	});

	it("files every other flag under its bare id", () => {
		expect(
			flagFilterValue({ id: "agreement_missing", variant: "guest" })
		).toBe("agreement_missing");
	});
});
