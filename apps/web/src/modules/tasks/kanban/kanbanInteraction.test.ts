// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { withoutFailedMoves } from "./kanbanInteraction.ts";

test("drops the override of a card whose move failed", () => {
	expect(withoutFailedMoves({ a: "done", b: "done" }, ["a"], "done")).toEqual(
		{ b: "done" }
	);
});

test("keeps the override of a card that has since been moved again", () => {
	expect(
		withoutFailedMoves({ a: "in_progress", b: "done" }, ["a", "b"], "done")
	).toEqual({ a: "in_progress" });
});
