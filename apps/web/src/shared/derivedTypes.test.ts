import type { ComponentProps } from "solid-js";
import { expectTypeOf, test } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

import type { StaffMember } from "./data/boardLevel.tsx";
import type { LinkConfirmationStatus } from "./linkConfirmation.ts";
import type { NotificationsSheet } from "./notifications/NotificationsSheet.tsx";
import type { OpenProps } from "./types.ts";

test("StaffMember is a slice of the board-level rows the query returns", () => {
	expectTypeOf<StaffMember["_id"]>().toEqualTypeOf<Id<"people">>();
});

test("a confirm page's status is loading, invalid, or the response's own", () => {
	expectTypeOf<
		LinkConfirmationStatus<{ status: "verified" | "expired" }>
	>().toEqualTypeOf<"loading" | "invalid" | "verified" | "expired">();
});

test("the notifications sheet takes the shared controlled-open pair", () => {
	expectTypeOf<
		ComponentProps<typeof NotificationsSheet>
	>().toExtend<OpenProps>();
});
