// @vitest-environment happy-dom
import { actionsColumnSize } from "@j-os/design-system";
import { expect, test } from "vitest";

import type { Doc } from "../../../convex/_generated/dataModel";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import { formatDateIn } from "../../shared/time.ts";

import { eventColumns } from "./eventColumns.tsx";

const STARTS = Date.UTC(2026, 9, 8, 18);
const ENDS = Date.UTC(2026, 9, 9, 2);
const event = { startsAt: STARTS, endsAt: ENDS } as Doc<"events">;

function column(key: string) {
	return eventColumns({ canManage: true }).find(
		(candidate) =>
			(candidate.id ??
				(candidate as { accessorKey?: string }).accessorKey) === key
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
	expect(starts(event)).toBe(formatDateIn(STARTS, SITE_TIMEZONE));
	expect(ends(event)).toBe(formatDateIn(ENDS, SITE_TIMEZONE));
});

test("the actions column is a display column with a fixed width", () => {
	const actions = column("actions");
	expect(actions?.size).toBe(actionsColumnSize(2));
	expect(actions).not.toHaveProperty("dataType");
	expect(actions).not.toHaveProperty("enableSorting");
	expect(actions).not.toHaveProperty("enableColumnFilter");
});

test("whoever cannot manage events gets no actions column", () => {
	const ids = eventColumns({ canManage: false }).map(
		(candidate) => candidate.id
	);
	expect(ids).not.toContain("actions");
});
