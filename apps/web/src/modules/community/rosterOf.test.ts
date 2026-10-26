import { expect, test } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { rosterOf } from "./rosterOf.ts";

function row(id: string) {
	return { _id: id as Id<"people"> };
}

function personId(id: string) {
	return id as Id<"people">;
}

const rosters: Parameters<typeof rosterOf>[1] = {
	applications: [row("a1")],
	members: [row("m1")],
	guests: [row("g1")],
};

test("finds the roster a person is in", () => {
	expect(rosterOf(personId("a1"), rosters)).toBe("applications");
	expect(rosterOf(personId("m1"), rosters)).toBe("members");
	expect(rosterOf(personId("g1"), rosters)).toBe("guests");
});

test("a person in none of them, or rosters still loading, is undefined", () => {
	expect(rosterOf(personId("x"), rosters)).toBeUndefined();
	expect(
		rosterOf(personId("a1"), {
			applications: undefined,
			members: undefined,
			guests: undefined,
		})
	).toBeUndefined();
});

test("a person in two rosters resolves applications, then members, then guests", () => {
	expect(
		rosterOf(personId("p"), {
			applications: [row("p")],
			members: [row("p")],
			guests: [row("p")],
		})
	).toBe("applications");
	expect(
		rosterOf(personId("p"), {
			applications: [],
			members: [row("p")],
			guests: [row("p")],
		})
	).toBe("members");
});
