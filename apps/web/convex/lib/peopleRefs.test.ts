import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "../schema.ts";

import {
	documentsNaming,
	pathsNaming,
	peopleReferencePlans,
	peopleReferenceTables,
	readBudget,
	replacePersonId,
	stripPersonId,
} from "./peopleRefs.ts";

describe("peopleReferenceTables", () => {
	it("finds every table that can point at a person", () => {
		expect(
			peopleReferenceTables().sort((first, second) =>
				first.localeCompare(second)
			)
		).toEqual(
			[
				"confirmTokens",
				"eventAttendance",
				"doorLog",
				"events",
				"notifications",
				"people",
				"personEvents",
				"personState",
				"projects",
				"pushSubscriptions",
				"signatures",
				"tasks",
			].sort((first, second) => first.localeCompare(second))
		);
	});
});

describe("peopleReferencePlans", () => {
	it("index-walks exactly the tables whose every person id leads an index", () => {
		const plans = peopleReferencePlans();
		const walked = Object.entries(plans)
			.filter(([, plan]) => plan.mode === "index")
			.map(([name]) => name)
			.sort((first, second) => first.localeCompare(second));
		expect(walked).toEqual(
			[
				"confirmTokens",
				"eventAttendance",
				"doorLog",
				"notifications",
				"personState",
				"pushSubscriptions",
				"signatures",
			].sort((first, second) => first.localeCompare(second))
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
		const plans = peopleReferencePlans();
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

describe("documentsNaming", () => {
	it("refuses with ReadBudgetExceeded when the walk would read past its budget", async () => {
		const backend = convexTest(schema, import.meta.glob("../**/*.*s"));
		const personId = await backend.run(async (context) => {
			const id = await context.db.insert("people", {
				email: "walk@example.com",
				firstName: "Walk",
				lastName: "Test",
				tier: "member",
				stage: "active",
				stageSince: 0,
			});
			await context.db.insert("personEvents", {
				personId: id,
				at: 0,
				kind: "merge",
			});
			return id;
		});
		const refusal = await backend.run(async (context) => {
			const result = await documentsNaming(context, personId, {
				left: 0,
			});
			return result.isErr() && result.error.type;
		});
		expect(refusal).toBe("ReadBudgetExceeded");
		const isWalked = await backend.run(async (context) => {
			const result = await documentsNaming(
				context,
				personId,
				readBudget()
			);
			return result.isOk();
		});
		expect(isWalked).toBe(true);
	});
});
