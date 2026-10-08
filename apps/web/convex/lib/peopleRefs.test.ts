import { describe, expect, it } from "vitest";

import {
	pathsNaming,
	peopleRefPlans,
	peopleRefTables,
	replacePersonId,
	stripPersonId,
} from "./peopleRefs.ts";

describe("peopleRefTables", () => {
	it("finds every table that can point at a person", () => {
		expect(peopleRefTables().sort()).toEqual(
			[
				"confirmTokens",
				"eventAttendance",
				"doorLog",
				"events",
				"notifications",
				"people",
				"personEvents",
				"projects",
				"pushSubscriptions",
				"signatures",
				"tasks",
			].sort()
		);
	});
});

describe("peopleRefPlans", () => {
	it("index-walks exactly the tables whose every person id leads an index", () => {
		const plans = peopleRefPlans();
		const walked = Object.entries(plans)
			.filter(([, plan]) => plan.mode === "index")
			.map(([name]) => name)
			.sort();
		expect(walked).toEqual(
			[
				"confirmTokens",
				"eventAttendance",
				"doorLog",
				"notifications",
				"pushSubscriptions",
				"signatures",
			].sort()
		);
		const logPlan = {
			mode: "index",
			lookups: [
				{ index: "by_personId_and_at", field: "personId" },
				{ index: "by_actor", field: "actorId" },
			],
		};
		expect(plans.doorLog).toEqual(logPlan);
		expect(plans.notifications).toEqual({
			mode: "index",
			lookups: [
				{ index: "by_personId_and_createdAt", field: "personId" },
			],
		});
	});

	it("scans a table with a nested id, an unindexed id, or an any", () => {
		const plans = peopleRefPlans();
		// Nested ids and unindexed id fields.
		for (const table of ["people", "tasks", "projects", "events"])
			expect(plans[table]).toEqual({ mode: "scan" });
		// personEvents has indexed personId/actorId, but before/after/meta are
		// `any` and so could hold an id the indexes cannot find.
		expect(plans.personEvents).toEqual({ mode: "scan" });
	});
});

describe("replacePersonId", () => {
	it("replaces nested ids and reports a change", () => {
		const { value, changed } = replacePersonId(
			{ a: "drop", b: ["x", "drop"], c: { d: { e: "drop" } }, f: 3 },
			"drop",
			"keep"
		);
		expect(changed).toBe(true);
		expect(value).toEqual({
			a: "keep",
			b: ["x", "keep"],
			c: { d: { e: "keep" } },
			f: 3,
		});
	});
	it("keeps the kept id once in an array that named both people", () => {
		const { value } = replacePersonId(
			{
				assigneeIds: ["keep", "drop", "other"],
				untouched: ["keep", "keep"],
			},
			"drop",
			"keep"
		);
		expect(value).toEqual({
			assigneeIds: ["keep", "other"],
			untouched: ["keep", "keep"],
		});
	});
	it("leaves unrelated values alone", () => {
		expect(replacePersonId({ a: "other" }, "drop", "keep").changed).toBe(
			false
		);
	});
});

describe("stripPersonId", () => {
	it("drops the key that held the id and the array entry naming it", () => {
		const { value, changed } = stripPersonId(
			{
				hostedById: "gone",
				assigneeIds: ["x", "gone"],
				noteLog: [{ authorId: "gone", text: "hi", at: 1 }],
				onboarding: { boardSteps: { whatsapp: { byId: "gone" } } },
				n: 3,
			},
			"gone"
		);
		expect(changed).toBe(true);
		expect(value).toEqual({
			assigneeIds: ["x"],
			noteLog: [{ text: "hi", at: 1 }],
			onboarding: { boardSteps: { whatsapp: {} } },
			n: 3,
		});
	});
	it("leaves a document that does not name the person alone", () => {
		expect(stripPersonId({ a: ["other"], b: "x" }, "gone").changed).toBe(
			false
		);
	});
});

describe("pathsNaming", () => {
	it("lists every dotted path that holds the id, and nothing else", () => {
		expect(
			pathsNaming(
				{
					hostedById: "gone",
					assigneeIds: ["x", "gone"],
					board: { noteLog: [{ authorId: "gone", text: "gone!" }] },
					n: 3,
				},
				"gone"
			)
		).toEqual(["hostedById", "assigneeIds.1", "board.noteLog.0.authorId"]);
	});
});
