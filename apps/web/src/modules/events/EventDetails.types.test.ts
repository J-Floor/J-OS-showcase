import type { FunctionArgs } from "convex/server";
import { describe, expectTypeOf, it } from "vitest";

import type { api } from "../../../convex/_generated/api";

import type { EventPatch } from "./EventDetails.tsx";

describe("EventPatch", () => {
	it("is any subset of what updateEvent takes, minus the id", () => {
		expectTypeOf<EventPatch>().toEqualTypeOf<
			Omit<FunctionArgs<typeof api.events.updateEvent>, "eventId">
		>();
		expectTypeOf<{ name: string }>().toExtend<EventPatch>();
		expectTypeOf<{ startsAtLocal: string }>().toExtend<EventPatch>();
	});

	it("rejects a misspelt field", () => {
		expectTypeOf<{ startAtLocal: string }>().not.toExtend<EventPatch>();
		expectTypeOf<{ eventId: string }>().not.toExtend<EventPatch>();
	});
});
