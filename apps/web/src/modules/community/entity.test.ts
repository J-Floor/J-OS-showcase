// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { PersonRow } from "../../../convex/people.ts";

const prefetch = vi.fn<(...args: unknown[]) => void>();
vi.mock("../../shared/data/queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("../../shared/data/queryKeeper.ts")>()),
	prefetchSpec: (
		spec: { query: unknown; args: (key: unknown) => unknown },
		key: unknown
	) => {
		prefetch(spec.query, spec.args(key));
	},
}));

import { personEntity } from "./entity.ts";

const row = { _id: "p1" } as unknown as PersonRow;

it("prefetches the sheet's attended events for a viewer of applications", () => {
	prefetch.mockClear();
	personEntity.prefetch?.(
		row,
		(action, subject) => action === "view" && subject === "Applications"
	);
	expect(prefetch).toHaveBeenCalledWith(api.people.attendedEvents, {
		personId: "p1",
	});
	expect(prefetch).toHaveBeenCalledTimes(1);
});

it("prefetches nothing for a viewer who cannot see applications", () => {
	prefetch.mockClear();
	personEntity.prefetch?.(row, () => false);
	expect(prefetch).not.toHaveBeenCalled();
});
