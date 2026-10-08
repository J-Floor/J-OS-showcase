import { expect, test } from "vitest";

import {
	isoToMs,
	msToIso,
	dateToIso,
	formatDate,
	sortColumn,
	personName,
	assigneeNames,
	projectName,
	filterTasksByAssignee,
} from "./taskHelpers.ts";

const TASKS = [
	{ _id: "t1", assigneeIds: ["p1", "p2"] },
	{ _id: "t2", assigneeIds: ["p2"] },
	{ _id: "t3" }, // unassigned
];

test("filterTasksByAssignee: 'all' keeps every task", () => {
	expect(filterTasksByAssignee(TASKS, "all", "p1").map((t) => t._id)).toEqual(
		["t1", "t2", "t3"]
	);
});

test("filterTasksByAssignee: 'me' keeps tasks for the current person", () => {
	expect(filterTasksByAssignee(TASKS, "me", "p2").map((t) => t._id)).toEqual([
		"t1",
		"t2",
	]);
});

test("filterTasksByAssignee: 'me' with no current person matches nothing", () => {
	expect(filterTasksByAssignee(TASKS, "me", undefined)).toEqual([]);
});

test("filterTasksByAssignee: a person id keeps that person's tasks", () => {
	expect(filterTasksByAssignee(TASKS, "p1", "p2").map((t) => t._id)).toEqual([
		"t1",
	]);
});

test("isoToMs / msToIso round-trip a date", () => {
	const ms = isoToMs("2026-06-22");
	expect(ms).toBe(Date.parse("2026-06-22"));
	expect(msToIso(ms)).toBe("2026-06-22");
	expect(isoToMs(null)).toBeUndefined();
	expect(msToIso(undefined)).toBeUndefined();
});

test("dateToIso reads the LOCAL calendar day (timezone-safe)", () => {
	// A local-midnight Date must serialize to the same calendar day in any
	// timezone, not shift a day via UTC conversion.
	const localMidnight = new Date(2026, 5, 22); // local 2026-06-22 00:00
	expect(dateToIso(localMidnight)).toBe("2026-06-22");
	// And it feeds isoToMs to the same UTC-midnight ms storage uses.
	expect(isoToMs(dateToIso(localMidnight))).toBe(Date.parse("2026-06-22"));
});

test("formatDate renders the stored UTC day (no off-by-one in any zone)", () => {
	expect(formatDate(isoToMs("2026-06-22"))).toBe("22 Jun 2026");
	expect(formatDate(undefined)).toBe("");
});

test("sortColumn: due dates ascending, undated last, then creation", () => {
	const a = { dueDate: 200, _creationTime: 1 };
	const b = { dueDate: 100, _creationTime: 2 };
	const c = { _creationTime: 3 };
	const d = { _creationTime: 0 };
	expect(sortColumn([a, b, c, d])).toEqual([b, a, d, c]);
});

test("name + project lookups", () => {
	const people = [{ _id: "p1", firstName: "Ada", lastName: "Lovelace" }];
	const projects = [{ _id: "pr1", name: "Launch" }];
	expect(personName("p1", people)).toBe("Ada Lovelace");
	expect(personName("nope", people)).toBe("Unknown");
	expect(assigneeNames(["p1"], people)).toEqual(["Ada Lovelace"]);
	expect(projectName("pr1", projects)).toBe("Launch");
	expect(projectName(undefined, projects)).toBeUndefined();
});
