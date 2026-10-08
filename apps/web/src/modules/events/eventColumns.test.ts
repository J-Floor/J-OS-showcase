// @vitest-environment happy-dom
import { expect, test } from "vitest";

import type { Doc } from "../../../convex/_generated/dataModel";
import { actionsColumnSize } from "../community/columns/RowActions.tsx";

import { eventColumns, formatEventDate } from "./eventColumns.tsx";

const STARTS = Date.UTC(2026, 9, 8, 18);
const ENDS = Date.UTC(2026, 9, 9, 2);
const event = { startsAt: STARTS, endsAt: ENDS } as Doc<"events">;

function column(key: string) {
	return eventColumns().find(
		(c) => (c.id ?? (c as { accessorKey?: string }).accessorKey) === key
	);
}

test("the name shares the leftover width, and the dates fit what they show", () => {
	expect(column("name")?.size).toBeUndefined();
	expect(column("startsAt")?.size).toBe("content");
	expect(column("endsAt")?.size).toBe("content");
	const starts = column("startsAt")?.measureText;
	const ends = column("endsAt")?.measureText;
	if (typeof starts !== "function" || typeof ends !== "function")
		throw new Error("the date columns must measure the text they show");
	expect(starts(event)).toBe(formatEventDate(STARTS));
	expect(ends(event)).toBe(formatEventDate(ENDS));
});

test("the actions column is a display column with a fixed width", () => {
	const actions = column("actions");
	expect(actions?.size).toBe(actionsColumnSize(2));
	expect(actions).not.toHaveProperty("dataType");
	expect(actions).not.toHaveProperty("enableSorting");
	expect(actions).not.toHaveProperty("enableColumnFilter");
});
