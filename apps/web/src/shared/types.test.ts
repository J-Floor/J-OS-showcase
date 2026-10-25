import type {
	DialogRootProps,
	OverlayOpenProps,
	SheetRootProps,
} from "@j-os/design-system";
import type { useSearchParams } from "@solidjs/router";
import { describe, expectTypeOf, it } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";

import type { EntityRow, Identified, OpenProps, SetParams } from "./types.ts";

describe("shared types", () => {
	it("OpenProps is the design system's controlled-open pair", () => {
		expectTypeOf<OpenProps>().toEqualTypeOf<OverlayOpenProps>();
		expectTypeOf<
			Pick<SheetRootProps, "open" | "onOpenChange">
		>().toEqualTypeOf<OpenProps>();
		expectTypeOf<OpenProps["open"]>().toEqualTypeOf<boolean>();
		expectTypeOf<OpenProps["onOpenChange"]>().toEqualTypeOf<
			(isOpen: boolean) => void
		>();
	});

	it("a Dialog takes the same open handler as a Sheet", () => {
		expectTypeOf<
			NonNullable<DialogRootProps["onOpenChange"]>
		>().toEqualTypeOf<OpenProps["onOpenChange"]>();
	});

	it("Identified carries the table's id", () => {
		expectTypeOf<Identified<"people">["_id"]>().toEqualTypeOf<
			Id<"people">
		>();
		expectTypeOf<Identified<"people">>().toEqualTypeOf<{
			_id: Id<"people">;
		}>();
	});

	it("SetParams is the router's search-params setter", () => {
		// The shape of the copies in createInventorySelections.ts and
		// createInventoryScanner.ts.
		expectTypeOf<SetParams>().toEqualTypeOf<
			ReturnType<typeof useSearchParams>[1]
		>();
	});

	it("EntityRow accepts any row with a string id", () => {
		expectTypeOf<{ _id: Id<"people"> }>().toExtend<EntityRow>();
		expectTypeOf<{ _id: string; name: string }>().toExtend<EntityRow>();
	});
});
