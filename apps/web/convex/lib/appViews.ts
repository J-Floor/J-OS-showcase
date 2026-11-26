// Anonymous view counts: which page or entity a key names, which bucket a
// viewer's tier counts in, and the range summaries the Analytics page reads.
import { v, type Infer } from "convex/values";

import { DAY_MS } from "./constants.ts";
import type { Tier } from "./lifecycleTypes.ts";
import { isBoardLevel } from "./roles.ts";
import { ISO_DATE_LENGTH } from "./time.ts";

/** Module id → page label. Pinned against the app's module registry by
 *  `src/routing/viewKeys.test.ts`. */
export const VIEW_PAGES: Record<string, string> = {
	community: "Community",
	space: "Space",
	events: "Events",
	inventory: "Inventory",
	perks: "Perks",
	tasks: "Tasks",
	analytics: "Analytics",
};

/** Entity kinds a view key may name: the `key` of every entity descriptor.
 *  Pinned against `entityDescriptors` by `src/routing/viewKeys.test.ts`. */
export const VIEW_KINDS = [
	"person",
	"event",
	"perk",
	"request",
	"task",
	"project",
	"item",
	"type",
	"category",
] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

const PAGE_PREFIX = "page";
const SEPARATOR = ":";
const SLUG_MAX = 64;
export const SNAPSHOT_TOP = 50;
export const SHOWN_TOP = 10;
export const MAX_KEYS_PER_DAY = 2000;

export type ParsedViewKey =
	| { type: "page"; moduleId: string }
	| { type: "entity"; kind: ViewKind; slug: string };

function isViewKind(value: string): value is ViewKind {
	return (VIEW_KINDS as readonly string[]).includes(value);
}

export function parseViewKey(key: string): ParsedViewKey | undefined {
	const at = key.indexOf(SEPARATOR);
	if (at <= 0) return undefined;
	const head = key.slice(0, at);
	const rest = key.slice(at + 1);
	if (rest.length === 0 || rest.length > SLUG_MAX) return undefined;
	if (head === PAGE_PREFIX)
		return Object.hasOwn(VIEW_PAGES, rest)
			? { type: "page", moduleId: rest }
			: undefined;
	return isViewKind(head)
		? { type: "entity", kind: head, slug: rest }
		: undefined;
}

/** The view key of a module's page. */
export function pageViewKey(moduleId: string): string {
	return `${PAGE_PREFIX}${SEPARATOR}${moduleId}`;
}

export function bucketOf(tier: Tier): RoleBucket {
	if (isBoardLevel(tier)) return "board";
	return tier === "guest" ? "guests" : "members";
}

export function shiftDay(day: string, delta: number): string {
	return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS)
		.toISOString()
		.slice(0, ISO_DATE_LENGTH);
}

export const roleCountsValidator = v.object({
	members: v.number(),
	board: v.number(),
	guests: v.number(),
});
export type RoleCounts = Infer<typeof roleCountsValidator>;
export type RoleBucket = keyof RoleCounts;

export const NO_VIEWS: RoleCounts = { members: 0, board: 0, guests: 0 };

export function totalViews(counts: RoleCounts): number {
	return counts.members + counts.board + counts.guests;
}

/** A ranked key carries no label: labels are read when the summary is
 *  served, so an erased person or a deleted item leaves no name behind. */
const rankedViewValidator = v.object({
	key: v.string(),
	count: v.number(),
});
export type RankedView = Infer<typeof rankedViewValidator>;
export type LabelledView = RankedView & { label: string };

export const viewSummaryValidator = v.object({
	daily: v.array(
		v.object({ date: v.string(), ...roleCountsValidator.fields })
	),
	totals: roleCountsValidator,
	pages: v.array(rankedViewValidator),
	entities: v.array(rankedViewValidator),
});
type ViewSummary = Infer<typeof viewSummaryValidator>;
/** What `appViews.summary` serves: ranked rows labelled at read time. */
export type ShownViewSummary = Omit<ViewSummary, "pages" | "entities"> & {
	pages: LabelledView[];
	entities: LabelledView[];
};

export type DailyRow = { day: string; key: string } & RoleCounts;

function plus(left: RoleCounts, right: RoleCounts): RoleCounts {
	return {
		members: left.members + right.members,
		board: left.board + right.board,
		guests: left.guests + right.guests,
	};
}

function daysBetween(from: string, to: string): string[] {
	const days: string[] = [];
	for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day);
	return days;
}

/** Views per key, pages and entities apart. */
type Tallies = { pages: Map<string, number>; entities: Map<string, number> };

function newTallies(): Tallies {
	return { pages: new Map(), entities: new Map() };
}

function tally(into: Tallies, key: string, count: number) {
	const counts = isPageKey(key) ? into.pages : into.entities;
	counts.set(key, (counts.get(key) ?? 0) + count);
}

/** Most viewed first; equal counts by key, so the order is stable. */
function ranked(from: Map<string, number>, top: number): RankedView[] {
	return [...from.entries()]
		.map(([key, count]) => ({ key, count }))
		.sort(
			(first, second) =>
				second.count - first.count ||
				first.key.localeCompare(second.key)
		)
		.slice(0, top);
}

function isPageKey(key: string): boolean {
	return key.startsWith(`${PAGE_PREFIX}${SEPARATOR}`);
}

function summarise(
	byDay: Map<string, RoleCounts>,
	days: string[],
	tallies: Tallies,
	top: number
): ViewSummary {
	const daily = days.map((date) => ({
		date,
		...(byDay.get(date) ?? NO_VIEWS),
	}));
	return {
		daily,
		totals: daily.reduce<RoleCounts>(
			(sum, day) => plus(sum, day),
			NO_VIEWS
		),
		pages: ranked(tallies.pages, top),
		entities: ranked(tallies.entities, top),
	};
}

function addRows(
	rows: DailyRow[],
	byDay: Map<string, RoleCounts>,
	tallies: Tallies
) {
	for (const row of rows) {
		byDay.set(row.day, plus(byDay.get(row.day) ?? NO_VIEWS, row));
		tally(tallies, row.key, totalViews(row));
	}
}

export function buildSummary(
	rows: DailyRow[],
	from: string,
	to: string,
	top: number
): ViewSummary {
	const byDay = new Map<string, RoleCounts>();
	const tallies = newTallies();
	addRows(
		rows.filter((row) => row.day >= from && row.day <= to),
		byDay,
		tallies
	);
	return summarise(byDay, daysBetween(from, to), tallies, top);
}

function addPastDays(
	past: ViewSummary,
	byDay: Map<string, RoleCounts>,
	from: string,
	todayDay: string
) {
	for (const { date, ...counts } of past.daily)
		if (date >= from && date < todayDay) byDay.set(date, counts);
}

export function mergeToday({
	past,
	today,
	from,
	todayDay,
	top,
}: {
	past: ViewSummary | undefined;
	today: DailyRow[];
	from: string;
	todayDay: string;
	top: number;
}): ViewSummary {
	const byDay = new Map<string, RoleCounts>();
	const tallies = newTallies();
	if (past) {
		addPastDays(past, byDay, from, todayDay);
		for (const view of [...past.pages, ...past.entities])
			tally(tallies, view.key, view.count);
	}
	addRows(today, byDay, tallies);
	return summarise(byDay, daysBetween(from, todayDay), tallies, top);
}
