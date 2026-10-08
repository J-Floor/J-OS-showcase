import {
	formatDateOnly,
	isoToUtcMidnight,
	utcMidnightToIso,
} from "../../../../convex/lib/time.ts";

type TaskLike = { dueDate?: number; _creationTime: number };
type PersonLike = { _id: string; firstName: string; lastName: string };
type ProjectLike = { _id: string; name: string };

/** Sentinel filter values for the Tasks assignee filter; any other value is a
 * person id. */
export const ASSIGNEE_FILTER_ALL = "all";
export const ASSIGNEE_FILTER_ME = "me";

/**
 * Filter tasks by the assignee-filter value: `"all"` keeps everything, `"me"`
 * keeps tasks assigned to `currentPersonId`, and any other value keeps tasks
 * assigned to that person id. A `"me"` filter with no resolved current person
 * matches nothing (rather than leaking everyone's tasks while it loads).
 */
export function filterTasksByAssignee<T extends { assigneeIds?: string[] }>(
	tasks: readonly T[],
	filter: string,
	currentPersonId: string | undefined
): T[] {
	if (filter === ASSIGNEE_FILTER_ALL) return [...tasks];
	const id = filter === ASSIGNEE_FILTER_ME ? currentPersonId : filter;
	if (id == null) return [];
	return tasks.filter((t) => t.assigneeIds?.includes(id) ?? false);
}

export function isoToMs(iso: string | null): number | undefined {
	return isoToUtcMidnight(iso);
}

export function msToIso(ms: number | undefined): string | undefined {
	return utcMidnightToIso(ms);
}

// Calendar day (YYYY-MM-DD) of a Date read in LOCAL time. Any UI handing back a
// local-midnight Date (e.g. `new Date()` for "today") needs its day read from
// local Y/M/D components; `toISOString()` would convert to UTC and shift the day
// by ±1 in non-UTC zones. Reading the local components recovers the day the user
// actually sees, which isoToMs then stores as UTC midnight.
export function dateToIso(d: Date): string {
	const y = String(d.getFullYear());
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function formatDate(ms: number | undefined): string {
	return formatDateOnly(ms);
}

// Due date ascending; undated tasks sink to the bottom; ties broken by creation.
export function sortColumn<T extends TaskLike>(tasks: readonly T[]): T[] {
	return [...tasks].sort((a, b) => {
		const ad = a.dueDate ?? Infinity;
		const bd = b.dueDate ?? Infinity;
		if (ad !== bd) return ad - bd;
		return a._creationTime - b._creationTime;
	});
}

export function personName(id: string, people: readonly PersonLike[]): string {
	const p = people.find((x) => x._id === id);
	return p ? `${p.firstName} ${p.lastName}` : "Unknown";
}

export function assigneeNames(
	ids: readonly string[],
	people: readonly PersonLike[]
): string[] {
	return ids.map((id) => personName(id, people));
}

export function projectName(
	id: string | undefined,
	projects: readonly ProjectLike[]
): string | undefined {
	if (!id) return undefined;
	return projects.find((x) => x._id === id)?.name;
}
