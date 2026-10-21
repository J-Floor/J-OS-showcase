import type { ChartDatum } from "@j-os/design-system";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { DAY_MS, DAYS_PER_WEEK } from "../../../../convex/lib/constants.ts";
import {
	doorOpensFor,
	type PersonStatus,
} from "../../../../convex/lib/derive.ts";
import { shortNames } from "../../../../convex/lib/names.ts";

/**
 * Everything the board dashboard counts, derived from the three rosters the
 * console already subscribes to.
 *
 * PURE, and deliberately so. Every number here is a claim about the community
 * that somebody will act on — chase a guest, nudge a host, question an approval
 * — so each one is a function of its inputs that a test can pin. The tab itself
 * only arranges them.
 *
 * No new Convex queries: `CommunityDataProvider` already holds applications,
 * members, guests and the board-level list for the whole session, so the dashboard costs one
 * pass over data that is on the client anyway. The one thing it cannot derive —
 * whether the locks are actually reachable — comes from an action instead.
 */

export type PersonRow = Doc<"people"> & {
	status: PersonStatus;
	hasAgreement: boolean;
};

const WEEK_MS = DAYS_PER_WEEK * DAY_MS;
/** How far ahead "expiring soon" looks. Two weeks is roughly the notice a board
 *  member needs to have the conversation before the door shuts. */
export const EXPIRY_HORIZON_DAYS = 14;
/** Past this many days in `onboarding`, somebody is stuck rather than busy. */
export const STALLED_ONBOARDING_DAYS = 14;

/** The tiers that make up "the membership", as opposed to guests. */
const MEMBER_TIERS = new Set(["member", "core", "board", "admin"]);

function isActive(person: PersonRow): boolean {
	return person.stage === "active";
}
function isOnboarding(person: PersonRow): boolean {
	return person.stage === "onboarding";
}
/** A guest still in the tier, i.e. excluding the `former` rows the Guests
 *  roster also carries. */
function isGuest(person: PersonRow): boolean {
	return person.tier === "guest";
}
function isMember(person: PersonRow): boolean {
	return MEMBER_TIERS.has(person.tier);
}

export type Headline = {
	id: string;
	label: string;
	value: number;
	/** The second line: what the number means or what to do about it. */
	detail?: string;
	tone?: "neutral" | "warning" | "error";
};

function headlineGroups(
	members: PersonRow[],
	guests: PersonRow[],
	applications: PersonRow[],
	now: number
) {
	const activeMembers = members.filter(
		(person) => isMember(person) && isActive(person)
	);
	const onboardingMembers = members.filter(
		(person) => isMember(person) && isOnboarding(person)
	);
	const activeGuests = guests.filter(
		(person) => isGuest(person) && isActive(person)
	);
	const onboardingGuests = guests.filter(
		(person) => isGuest(person) && isOnboarding(person)
	);
	const currentGuests = [...activeGuests, ...onboardingGuests];

	const expiringSoon = currentGuests.filter((person) => {
		const until = person.accessUntil;
		return until === undefined
			? false
			: until > now && until <= now + EXPIRY_HORIZON_DAYS * DAY_MS;
	});
	const openEnded = currentGuests.filter(
		(person) => person.accessUntil === undefined
	);
	const hostless = currentGuests.filter(
		(person) =>
			person.hostedById === undefined && person.hostedBy === undefined
	);

	const everyone = [...members, ...guests];
	const stalled = everyone.filter(
		(person) =>
			isOnboarding(person) &&
			person.status.sinceDays > STALLED_ONBOARDING_DAYS
	);
	/**
	 * People who can open the door today and have signed nothing.
	 *
	 * Three exclusions, each for its own reason. Board and admin have no
	 * agreement variant at all, so counting them reports a backlog nobody can
	 * ever clear. Someone still ONBOARDING has not reached the signing step yet —
	 * that is the process working, not a gap. And a former member cannot get in,
	 * so their unsigned agreement is history, not exposure.
	 *
	 * What is left is the thing worth a red number: somebody who is in the
	 * building, right now, with nothing on file.
	 */
	const missingAgreement = everyone.filter(
		(person) =>
			!person.hasAgreement &&
			isActive(person) &&
			(person.tier === "guest" ||
				person.tier === "member" ||
				person.tier === "core") &&
			doorOpensFor(person, now)
	);
	const doorBlocked = everyone.filter(
		(person) =>
			person.door?.override === "force_off" && person.tier !== "former"
	);

	const unscored = applications.filter(
		(person) => person.board?.score === undefined
	);
	const scored = applications.filter(
		(person) =>
			person.board?.score !== undefined && person.stage !== "denied"
	);

	return {
		activeMembers,
		onboardingMembers,
		activeGuests,
		onboardingGuests,
		expiringSoon,
		openEnded,
		hostless,
		stalled,
		missingAgreement,
		doorBlocked,
		unscored,
		scored,
	};
}

type HeadlineGroups = ReturnType<typeof headlineGroups>;

function rosterHeadlines(groups: HeadlineGroups): Headline[] {
	const {
		activeMembers,
		onboardingMembers,
		activeGuests,
		onboardingGuests,
		expiringSoon,
		openEnded,
	} = groups;

	return [
		{
			id: "members",
			label: "Members",
			// The TOTAL on the roster, onboarding included, with the split in the
			// subtitle. The headline used to be the active count while every other
			// tile counted everyone present, so "Guests 59" sat next to
			// "Open-ended guests 82" and the dashboard appeared to contradict
			// itself. One population, one denominator, everywhere on this tab.
			value: activeMembers.length + onboardingMembers.length,
			detail: rosterSplit(activeMembers.length, onboardingMembers.length),
		},
		{
			id: "guests",
			label: "Guests",
			value: activeGuests.length + onboardingGuests.length,
			detail: rosterSplit(activeGuests.length, onboardingGuests.length),
		},
		{
			id: "expiring",
			label: `Expiring in ${String(EXPIRY_HORIZON_DAYS)} days`,
			value: expiringSoon.length,
			detail: "Guest windows about to close",
			tone: expiringSoon.length > 0 ? "warning" : "neutral",
		},
		{
			id: "openEnded",
			label: "Open-ended guests",
			value: openEnded.length,
			detail: "No end date set",
		},
	];
}

function attentionHeadlines(groups: HeadlineGroups): Headline[] {
	const {
		hostless,
		stalled,
		missingAgreement,
		doorBlocked,
		unscored,
		scored,
	} = groups;

	return [
		{
			id: "toScore",
			label: "To score",
			value: unscored.length,
			detail: "Applications nobody has rated",
			tone: unscored.length > 0 ? "warning" : "neutral",
		},
		{
			id: "queue",
			label: "In the queue",
			value: scored.length,
			detail: "Scored, awaiting a decision",
		},
		{
			id: "stalled",
			label: "Stalled onboarding",
			value: stalled.length,
			detail: `Over ${String(STALLED_ONBOARDING_DAYS)} days in onboarding`,
			tone: stalled.length > 0 ? "warning" : "neutral",
		},
		{
			id: "agreement",
			label: "Missing agreement",
			value: missingAgreement.length,
			detail: "Nothing signed on file",
			tone: missingAgreement.length > 0 ? "error" : "neutral",
		},
		{
			id: "hostless",
			label: "Guests with no host",
			value: hostless.length,
			detail: "Nobody to ask about them",
			tone: hostless.length > 0 ? "warning" : "neutral",
		},
		{
			id: "doorBlocked",
			label: "Door withheld",
			value: doorBlocked.length,
			detail: "Board override in force",
		},
	];
}

/**
 * The counts that belong on tiles rather than in charts.
 *
 * A single number is not a chart — plotting "17 guests" as one bar tells you
 * less than the word "17" does, and costs a legend to read.
 */
export function headlines(
	members: PersonRow[],
	guests: PersonRow[],
	applications: PersonRow[],
	now: number
): Headline[] {
	const groups = headlineGroups(members, guests, applications, now);
	return [...rosterHeadlines(groups), ...attentionHeadlines(groups)];
}

/**
 * The subtitle under a roster headline: the two parts that make it up.
 *
 * Both numbers, spelled out, because a "+34" under a headline of 93 reads as
 * "93 and another 34" — which is exactly how it was read the first time
 * somebody saw it. The parts summing to the headline is the point: it can be
 * checked at a glance, and there is nothing left to infer.
 */
function rosterSplit(active: number, onboarding: number): string {
	return onboarding === 0
		? "All active"
		: `${String(active)} active · ${String(onboarding)} still onboarding`;
}

/** `YYYY-MM` for an instant, in local time — the board reads these in its own
 *  calendar, not UTC's. */
function monthKey(at: number): string {
	const date = new Date(at);
	return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const YEARS_PER_CENTURY = 100;

export const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/** The axis label of a month (`month` is 1 to 12). The year appears on January
 *  only: repeating it on all twelve labels crowds the axis to say one thing. */
export function monthLabel(year: number, month: number): string {
	return month === 1
		? `${MONTH_NAMES[0]} ${String(year % YEARS_PER_CENTURY)}`
		: (MONTH_NAMES[month - 1] ?? "");
}

/** The last `count` months ending with the one containing `now`, oldest first. */
function recentMonths(
	now: number,
	count: number
): { key: string; label: string }[] {
	const out: { key: string; label: string }[] = [];
	const cursor = new Date(now);
	cursor.setDate(1);
	for (let index = count - 1; index >= 0; index--) {
		const date = new Date(cursor);
		date.setMonth(date.getMonth() - index);
		out.push({
			key: monthKey(date.getTime()),
			label: monthLabel(date.getFullYear(), date.getMonth() + 1),
		});
	}
	return out;
}

/**
 * Applications submitted per month, over the last `months` months.
 *
 * Read across EVERY roster, not just the Applications tab: an applicant who was
 * approved last week is no longer a prospect, and counting only the ones still
 * waiting would show inbound demand falling every time the board did its job.
 */
export function applicationsPerMonth(
	all: PersonRow[],
	now: number,
	months = 12
): ChartDatum[] {
	const buckets = new Map<string, number>();
	for (const person of all) {
		const at = person.submittedAt;
		if (at === undefined) continue;
		const key = monthKey(at);
		buckets.set(key, (buckets.get(key) ?? 0) + 1);
	}
	return recentMonths(now, months).map((month) => ({
		month: month.label,
		applications: buckets.get(month.key) ?? 0,
	}));
}

/**
 * People who gained access per month, split member vs guest.
 *
 * `accessFrom` is stamped once, when the window first opens, and cleared when
 * someone leaves — so this is "when the people who are here now arrived", not
 * a net-growth curve. Departures are not in it, and it must not be read as if
 * they were.
 */
export function joinsPerMonth(
	members: PersonRow[],
	guests: PersonRow[],
	now: number,
	months = 12
): ChartDatum[] {
	const memberBuckets = countByMonth(
		members.filter((person) => isMember(person))
	);
	const guestBuckets = countByMonth(
		guests.filter((person) => isGuest(person))
	);
	return recentMonths(now, months).map((month) => ({
		month: month.label,
		members: memberBuckets.get(month.key) ?? 0,
		guests: guestBuckets.get(month.key) ?? 0,
	}));
}

function countByMonth(people: PersonRow[]): Map<string, number> {
	const buckets = new Map<string, number>();
	for (const person of people) {
		const at = person.accessFrom;
		if (at === undefined) continue;
		const key = monthKey(at);
		buckets.set(key, (buckets.get(key) ?? 0) + 1);
	}
	return buckets;
}

/**
 * How many guest windows close in each of the next `weeks` weeks.
 *
 * The point of the chart is the shape, not the total: a flat runway is a board
 * with time to plan, and a spike is a week where a dozen people lose the door
 * at once and nobody remembered.
 */
export function expiryRunway(
	guests: PersonRow[],
	now: number,
	weeks = 12
): ChartDatum[] {
	const rows: ChartDatum[] = [];
	for (let index = 0; index < weeks; index++) {
		const from = now + index * WEEK_MS;
		const to = from + WEEK_MS;
		rows.push({
			week: index === 0 ? "This week" : `+${String(index)}w`,
			expiring: guests.filter((person) => {
				if (!isGuest(person)) return false;
				const until = person.accessUntil;
				return until !== undefined && until >= from && until < to;
			}).length,
		});
	}
	return rows;
}

/**
 * Guests per host, busiest first.
 *
 * Hosting is the one obligation the board takes on personally, and it is
 * invisible anywhere else in the console: nothing tells a board member they are
 * vouching for eleven people while a colleague vouches for none.
 */
export function hostLoad(
	guests: PersonRow[],
	boardLevel: { _id: Id<"people">; firstName: string; lastName: string }[],
	limit = 8
): ChartDatum[] {
	// `shortNames`, not `firstName`: the board has two Alans, and plotting both
	// as "Alan" merged two people's guest counts under a label that does not
	// even hint there are two of them. It only reaches for the surname initial
	// where a first name is actually ambiguous.
	const labels = shortNames(boardLevel);
	const counts = new Map<string, number>();
	for (const guest of guests) {
		if (!isGuest(guest)) continue;
		const id = guest.hostedById;
		const name =
			(id === undefined ? undefined : labels.get(id)) ??
			guest.hostedBy ??
			"Unassigned";
		counts.set(name, (counts.get(name) ?? 0) + 1);
	}
	return (
		[...counts.entries()]
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([host, guestCount]) => ({ host, guests: guestCount }))
	);
}

/** What the community is building, busiest first. Counts a person once per
 *  vertical they picked, so the total exceeds the head count on purpose. */
export function verticalMix(all: PersonRow[], limit = 6): ChartDatum[] {
	const counts = new Map<string, number>();
	for (const person of all) {
		if (person.tier === "former" || person.tier === "prospect") continue;
		const picked = person.vertical ?? [];
		for (const vertical of picked) {
			counts.set(vertical, (counts.get(vertical) ?? 0) + 1);
		}
	}
	return (
		[...counts.entries()]
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([vertical, people]) => ({ vertical, people }))
	);
}
