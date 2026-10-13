// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

const prefetch = vi.fn<(...a: unknown[]) => void>();
vi.mock("../../shared/data/queryKeeper.ts", async (orig) => ({
	...(await orig<typeof import("../../shared/data/queryKeeper.ts")>()),
	prefetchSpec: (
		spec: { query: unknown; args: (key: unknown) => unknown },
		key: unknown
	) => {
		prefetch(spec.query, spec.args(key));
	},
}));

import { eventsEntity } from "./entity.ts";

const row = { _id: "e1" } as unknown as Doc<"events">;

it("prefetches the attendee list for a manager", () => {
	prefetch.mockClear();
	eventsEntity.prefetch?.(row, (a, s) => a === "manage" && s === "Events");
	expect(prefetch).toHaveBeenCalledWith(api.events.listEventAttendees, {
		eventId: "e1",
	});
});

it("prefetches nothing for a viewer who cannot manage events", () => {
	prefetch.mockClear();
	eventsEntity.prefetch?.(row, (a) => a === "view");
	expect(prefetch).not.toHaveBeenCalled();
});
