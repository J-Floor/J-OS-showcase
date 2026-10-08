// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
	DAY_MS,
	applicationsPerMonth,
	expiryRunway,
	headlines,
	hostLoad,
	joinsPerMonth,
	verticalMix,
	type PersonRow,
} from "./metrics.ts";

/** A fixed instant so month bucketing is deterministic: 2026-08-04, 12:00 local. */
const NOW = new Date(2026, 7, 4, 12).getTime();

let seq = 0;
function person(fields: Partial<PersonRow> = {}): PersonRow {
	seq += 1;
	return {
		_id: `p${String(seq)}`,
		_creationTime: NOW,
		email: `p${String(seq)}@example.com`,
		firstName: "A",
		lastName: "B",
		tier: "member",
		stage: "active",
		stageSince: NOW,
		hasAgreement: true,
		status: {
			tier: "member",
			stage: "active",
			tone: "success",
			flags: [],
			facts: [],
			boardTasks: [],
			sinceDays: 0,
		},
		...fields,
	} as PersonRow;
}

function tile(rows: ReturnType<typeof headlines>, id: string) {
	const found = rows.find((r) => r.id === id);
	if (!found) throw new Error(`no tile ${id}`);
	return found;
}

describe("headlines", () => {
	it("separates the active roster from the people still onboarding", () => {
		const members = [
			person(),
			person(),
			person({ stage: "onboarding", status: statusDays(1) }),
		];
		const guests = [
			person({ tier: "guest" }),
			person({
				tier: "guest",
				stage: "onboarding",
				status: statusDays(1),
			}),
		];
		const rows = headlines(members, guests, [], NOW);
		// The headline is everyone on the roster; the split is the subtitle's
		// job. Headlining the ACTIVE count while every other tile counted
		// everyone present is what made "Guests 59" sit next to "Open-ended
		// guests 82" and read as a contradiction.
		expect(tile(rows, "members").value).toBe(3);
		// Both parts spelled out and summing to the headline: "+1" under a
		// headline of 3 reads as "3 and another 1", which is how it WAS read.
		expect(tile(rows, "members").detail).toBe(
			"2 active · 1 still onboarding"
		);
		expect(tile(rows, "guests").value).toBe(2);
	});

	it("does not count a former guest as a guest", () => {
		// The Guests roster carries `former` rows so the tab can show alumni;
		// counting them would inflate the headline every time somebody left.
		const guests = [person({ tier: "former", formerOf: "guest" })];
		expect(tile(headlines([], guests, [], NOW), "guests").value).toBe(0);
	});

	it("counts only guest windows closing inside the horizon", () => {
		const guests = [
			person({ tier: "guest", accessUntil: NOW + 3 * DAY_MS }),
			person({ tier: "guest", accessUntil: NOW + 13 * DAY_MS }),
			person({ tier: "guest", accessUntil: NOW + 30 * DAY_MS }),
			// Already gone: expiry is behind us, so there is nothing to act on.
			person({ tier: "guest", accessUntil: NOW - DAY_MS }),
		];
		const rows = headlines([], guests, [], NOW);
		expect(tile(rows, "expiring").value).toBe(2);
		expect(tile(rows, "expiring").tone).toBe("warning");
	});

	it("counts a guest with no end date as open-ended, not as expiring", () => {
		const guests = [person({ tier: "guest" })];
		const rows = headlines([], guests, [], NOW);
		expect(tile(rows, "openEnded").value).toBe(1);
		expect(tile(rows, "expiring").value).toBe(0);
	});

	it("flags onboarding that has stalled, not onboarding that is merely young", () => {
		const members = [
			person({ stage: "onboarding", status: statusDays(20) }),
			person({ stage: "onboarding", status: statusDays(3) }),
		];
		expect(tile(headlines(members, [], [], NOW), "stalled").value).toBe(1);
	});

	it("counts only people who can open the door today with nothing on file", () => {
		const members = [
			// Counted: in the building, right now, unsigned.
			person({ tier: "member", hasAgreement: false }),
			// Board and admin have no agreement variant at all, so counting them
			// reports a backlog nobody can ever clear.
			person({ tier: "board", hasAgreement: false }),
			person({ tier: "admin", hasAgreement: false }),
			// Still onboarding: they have not REACHED the signing step. That is
			// the process working, not a gap.
			person({
				tier: "member",
				stage: "onboarding",
				status: statusDays(2),
				hasAgreement: false,
			}),
			// Gone. An unsigned agreement is history, not exposure.
			person({
				tier: "former",
				formerReason: "left",
				hasAgreement: false,
			}),
			// Shut out by the board: cannot get in, so nothing is exposed.
			person({
				tier: "member",
				hasAgreement: false,
				door: { override: "force_off" },
			}),
			// Window has closed: same reasoning.
			person({
				tier: "guest",
				hasAgreement: false,
				accessUntil: NOW - DAY_MS,
			}),
		];
		const rows = headlines(members, [], [], NOW);
		expect(tile(rows, "agreement").value).toBe(1);
		expect(tile(rows, "agreement").tone).toBe("error");
	});

	it("stays silent when everyone in the building has signed", () => {
		const rows = headlines([person({ tier: "member" })], [], [], NOW);
		expect(tile(rows, "agreement").value).toBe(0);
		expect(tile(rows, "agreement").tone).toBe("neutral");
	});

	it("splits applications into unscored and queued", () => {
		const applications = [
			person({ tier: "prospect", stage: "verified" }),
			person({ tier: "prospect", stage: "queued", board: { score: 4 } }),
			// Denied rows are decided; they are not waiting on anyone.
			person({ tier: "prospect", stage: "denied", board: { score: 1 } }),
		];
		const rows = headlines([], [], applications, NOW);
		expect(tile(rows, "toScore").value).toBe(1);
		expect(tile(rows, "queue").value).toBe(1);
	});

	it("counts a guest with only the legacy host name as hosted", () => {
		const guests = [
			person({ tier: "guest", hostedBy: "Someone Unresolved" }),
			person({ tier: "guest" }),
		];
		expect(tile(headlines([], guests, [], NOW), "hostless").value).toBe(1);
	});
});

function statusDays(days: number): PersonRow["status"] {
	return {
		tier: "member",
		stage: "onboarding",
		tone: "warning",
		flags: [],
		facts: [],
		boardTasks: [],
		sinceDays: days,
	};
}

describe("applicationsPerMonth", () => {
	it("counts an applicant in the month they applied, whatever tier they are now", () => {
		// The whole point: an approved applicant leaves the prospect tier, and
		// counting only prospects would show demand collapsing every time the
		// board decided on someone.
		const rows = applicationsPerMonth(
			[
				person({ tier: "member", submittedAt: NOW - 2 * DAY_MS }),
				person({ tier: "guest", submittedAt: NOW - 2 * DAY_MS }),
				person({ tier: "prospect", submittedAt: NOW - 2 * DAY_MS }),
				person({ tier: "board" }),
			],
			NOW
		);
		expect(rows).toHaveLength(12);
		expect(rows.at(-1)).toEqual({ month: "Aug", applications: 3 });
	});

	it("puts the year on January only", () => {
		const rows = applicationsPerMonth([], NOW);
		expect(rows.map((r) => r.month)).toContain("Jan 26");
		expect(rows.map((r) => r.month)).toContain("Sep");
	});
});

describe("joinsPerMonth", () => {
	it("buckets members and guests separately by when access opened", () => {
		const rows = joinsPerMonth(
			[person({ accessFrom: NOW - DAY_MS })],
			[person({ tier: "guest", accessFrom: NOW - DAY_MS })],
			NOW
		);
		expect(rows.at(-1)).toEqual({ month: "Aug", members: 1, guests: 1 });
	});

	it("skips anyone whose access window was never opened", () => {
		const rows = joinsPerMonth([person()], [], NOW);
		expect(rows.every((r) => r.members === 0)).toBe(true);
	});
});

describe("expiryRunway", () => {
	it("drops each window into the week it closes", () => {
		const guests = [
			person({ tier: "guest", accessUntil: NOW + 2 * DAY_MS }),
			person({ tier: "guest", accessUntil: NOW + 8 * DAY_MS }),
			person({ tier: "guest", accessUntil: NOW + 9 * DAY_MS }),
		];
		const rows = expiryRunway(guests, NOW);
		expect(rows[0]).toEqual({ week: "This week", expiring: 1 });
		expect(rows[1]).toEqual({ week: "+1w", expiring: 2 });
	});

	it("leaves out windows that already closed and ones past the horizon", () => {
		const guests = [
			person({ tier: "guest", accessUntil: NOW - DAY_MS }),
			person({ tier: "guest", accessUntil: NOW + 400 * DAY_MS }),
		];
		expect(expiryRunway(guests, NOW).every((r) => r.expiring === 0)).toBe(
			true
		);
	});
});

describe("hostLoad", () => {
	const host = person({
		tier: "board",
		firstName: "Grace",
		lastName: "Hopper",
	});

	it("disambiguates two hosts sharing a first name", () => {
		// The board has two Alans. Plotting both as "Alan" merged two
		// people's guest counts under a label that does not hint there are two.
		const a = person({
			tier: "board",
			firstName: "Alan",
			lastName: "Turing",
		});
		const b = person({
			tier: "board",
			firstName: "Alan",
			lastName: "Perlis",
		});
		const guests = [
			person({ tier: "guest", hostedById: a._id }),
			person({ tier: "guest", hostedById: b._id }),
			person({ tier: "guest", hostedById: b._id }),
		];
		expect(hostLoad(guests, [a, b])).toEqual([
			{ host: "Alan P.", guests: 2 },
			{ host: "Alan T.", guests: 1 },
		]);
	});

	it("resolves the host id to a name and ranks by load", () => {
		const guests = [
			person({ tier: "guest", hostedById: host._id }),
			person({ tier: "guest", hostedById: host._id }),
			person({ tier: "guest" }),
		];
		expect(hostLoad(guests, [host])).toEqual([
			{ host: "Grace", guests: 2 },
			{ host: "Unassigned", guests: 1 },
		]);
	});

	it("falls back to the legacy host name when the id resolves to nobody", () => {
		const guests = [person({ tier: "guest", hostedBy: "Old Import" })];
		expect(hostLoad(guests, [])).toEqual([
			{ host: "Old Import", guests: 1 },
		]);
	});
});

describe("verticalMix", () => {
	it("counts a person once per vertical and leaves prospects out", () => {
		const rows = verticalMix([
			person({ vertical: ["ai", "fintech"] }),
			person({ vertical: ["ai"] }),
			person({ tier: "prospect", vertical: ["ai"] }),
			person({ tier: "former", vertical: ["ai"] }),
		] as PersonRow[]);
		expect(rows).toEqual([
			{ vertical: "ai", people: 2 },
			{ vertical: "fintech", people: 1 },
		]);
	});
});
