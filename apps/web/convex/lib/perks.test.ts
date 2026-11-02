import { describe, expect, it } from "vitest";

import type { Doc, Id } from "../_generated/dataModel";

import { messageFor } from "./errors/index.ts";
import type { PerksError } from "./errors/perks.ts";
import {
	isActiveContact,
	isOpenRequest,
	isPerkExpired,
	OPEN_REQUEST_STATUSES,
	parsePerkDate,
	PERK_CATEGORIES,
	PERK_CATEGORY_LABELS,
	PERK_REQUEST_STATUS_LABELS,
	PERK_REQUEST_STATUSES,
} from "./perks.ts";
import { SITE_TIMEZONE, todayIn } from "./time.ts";

// Each case is written as a UTC instant so the Zurich offset is visible.
function siteDayAt(instant: string): string {
	return todayIn(SITE_TIMEZONE, Date.parse(instant));
}

function expiredAt(validUntil: string | undefined, instant: string): boolean {
	return isPerkExpired(validUntil, Date.parse(instant));
}

const NOW = Date.parse("2026-07-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** An active board member with no access window, the usual perk contact. */
function contact(over: Partial<Doc<"people">> = {}): Doc<"people"> {
	return {
		_id: "contact1" as Id<"people">,
		_creationTime: 0,
		email: "contact@example.com",
		firstName: "Anna",
		lastName: "Example",
		tier: "board",
		stage: "active",
		stageSince: 0,
		...over,
	};
}

describe("perk labels", () => {
	it("names every category and status, in order", () => {
		expect(
			PERK_CATEGORIES.map((category) => PERK_CATEGORY_LABELS[category])
		).toEqual([
			"Cloud",
			"Software",
			"Legal",
			"Finance",
			"Marketing",
			"Hiring",
			"Other",
		]);
		expect(
			PERK_REQUEST_STATUSES.map(
				(status) => PERK_REQUEST_STATUS_LABELS[status]
			)
		).toEqual(["Requested", "Contacted", "Granted", "Declined"]);
	});
});

describe("isOpenRequest", () => {
	it("is open until the board grants or declines it", () => {
		expect(
			PERK_REQUEST_STATUSES.filter((status) => isOpenRequest(status))
		).toEqual(["requested", "contacted"]);
		expect(OPEN_REQUEST_STATUSES).toEqual(["requested", "contacted"]);
	});
});

describe("the site day", () => {
	it("is the Zurich date, a day ahead of UTC late on a summer evening", () => {
		// CEST (UTC+2): the 16th starts in Zurich at 22:00Z on the 15th.
		expect(siteDayAt("2026-07-15T21:59:00Z")).toBe("2026-07-15");
		expect(siteDayAt("2026-07-15T22:30:00Z")).toBe("2026-07-16");
	});
	it("turns an hour later in winter", () => {
		// CET (UTC+1): 22:30Z is 23:30 on the 15th; the 16th starts at 23:00Z.
		expect(siteDayAt("2026-01-15T22:30:00Z")).toBe("2026-01-15");
		expect(siteDayAt("2026-01-15T23:30:00Z")).toBe("2026-01-16");
	});
	it("follows the clock change on the night it happens", () => {
		// Summer time ends 2026-10-25 at 03:00, so that evening is UTC+1.
		expect(siteDayAt("2026-10-25T22:59:00Z")).toBe("2026-10-25");
		expect(siteDayAt("2026-10-25T23:00:00Z")).toBe("2026-10-26");
	});
});

describe("isPerkExpired", () => {
	it("keeps a perk through its last Zurich day in summer, not its last UTC day", () => {
		// CEST (UTC+2): the 15th ends in Zurich at 22:00Z.
		expect(expiredAt("2026-07-15", "2026-07-15T21:59:59Z")).toBe(false);
		expect(expiredAt("2026-07-15", "2026-07-15T22:00:00Z")).toBe(true);
		expect(expiredAt("2026-07-15", "2026-07-15T23:30:00Z")).toBe(true);
	});
	it("keeps a perk through its last Zurich day in winter", () => {
		// CET (UTC+1): 22:00Z is 23:00 on the 15th; the 16th starts at 23:00Z.
		expect(expiredAt("2026-01-15", "2026-01-15T22:00:00Z")).toBe(false);
		expect(expiredAt("2026-01-15", "2026-01-15T22:59:59Z")).toBe(false);
		expect(expiredAt("2026-01-15", "2026-01-15T23:30:00Z")).toBe(true);
	});
	it("is not expired before its last day", () => {
		expect(expiredAt("2026-07-15", "2026-07-14T12:00:00Z")).toBe(false);
	});
	it("never expires a perk with no end date", () => {
		for (const instant of [
			"1970-01-01T00:00:00Z",
			"2026-07-15T22:00:00Z",
			"2099-12-31T23:59:59Z",
		])
			expect(expiredAt(undefined, instant)).toBe(false);
	});
});

describe("parsePerkDate", () => {
	it("accepts a real calendar date written YYYY-MM-DD", () => {
		for (const value of ["2026-12-31", "2026-01-01", "2028-02-29"]) {
			const result = parsePerkDate(value);
			expect(result.isOk() && result.value, value).toBe(value);
		}
	});
	it("refuses a day the month lacks, a loose or longer form, and nothing", () => {
		for (const value of [
			"2026-02-30",
			"2026-02-29",
			"2026-13-01",
			"2026-2-3",
			"",
			" 2026-12-31",
			"2026-12-31T00:00",
			"31.12.2026",
		]) {
			const result = parsePerkDate(value);
			expect(result.isErr() && result.error.type, value).toBe(
				"PerkDateInvalid"
			);
		}
	});
});

describe("isActiveContact", () => {
	it("is nobody when the contact row is gone", () => {
		expect(isActiveContact(null, NOW)).toBe(false);
	});
	it("is a board member or an admin with access now", () => {
		expect(isActiveContact(contact(), NOW)).toBe(true);
		expect(isActiveContact(contact({ tier: "admin" }), NOW)).toBe(true);
		// Still onboarding counts: the stage is live.
		expect(isActiveContact(contact({ stage: "onboarding" }), NOW)).toBe(
			true
		);
		// A window that is still open counts too.
		expect(
			isActiveContact(
				contact({ accessFrom: NOW - DAY, accessUntil: NOW + DAY }),
				NOW
			)
		).toBe(true);
	});
	it("is never a member, however entitled", () => {
		for (const tier of ["member", "core", "guest", "staff"] as const)
			expect(isActiveContact(contact({ tier }), NOW), tier).toBe(false);
	});
	it("is not a board member outside their window or in a closed stage", () => {
		// The window closed (`accessUntil` is exclusive) or has not opened.
		expect(isActiveContact(contact({ accessUntil: NOW - DAY }), NOW)).toBe(
			false
		);
		expect(isActiveContact(contact({ accessUntil: NOW }), NOW)).toBe(false);
		expect(isActiveContact(contact({ accessFrom: NOW + DAY }), NOW)).toBe(
			false
		);
		// Not a live stage, so not entitled whatever the window says.
		expect(isActiveContact(contact({ stage: "expired" }), NOW)).toBe(false);
		expect(isActiveContact(contact({ stage: "denied" }), NOW)).toBe(false);
	});
});

describe("perk errors", () => {
	it("are registered with the messages the app shows", () => {
		const messages: Record<PerksError["type"], string> = {
			PerkNotFound: "This perk is no longer available.",
			PerkExpired: "This perk has expired.",
			PerkFieldRequired: "Partner, perk and terms are required.",
			PerkContactNotBoard:
				"The contact must be a board member or admin with access.",
			PerkLinkInvalid: "The link must be a web address (http or https).",
			PerkDateInvalid: "The end date must be a valid date.",
			PerkRequestNotFound: "Request not found.",
		};
		for (const [type, message] of Object.entries(messages))
			expect(messageFor({ type } as PerksError), type).toBe(message);
	});
});
