import { expect, it } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { hostDisplay } from "./hostDisplay.ts";
import { noteAuthor } from "./noteAuthor.ts";

const BO = "s1" as Id<"people">;
const staff = [{ _id: BO, firstName: "Bo", lastName: "Ard" }];

it("noteAuthor: Board for no author or a former member, undefined while loading", () => {
	expect(noteAuthor(staff, undefined)).toBe("Board");
	expect(noteAuthor(staff, "gone" as Id<"people">)).toBe("Board");
	expect(noteAuthor(undefined, BO)).toBeUndefined();
	expect(noteAuthor(staff, BO)).toBe("Bo Ard");
});

it("hostDisplay: referenced name, legacy fallback, loading only for a referenced host", () => {
	expect(hostDisplay(staff, { hostedById: BO })).toEqual({
		name: "Bo Ard",
		loading: false,
	});
	expect(
		hostDisplay(staff, {
			hostedById: "gone" as Id<"people">,
			hostedBy: "Old",
		})
	).toEqual({ name: "Old", loading: false });
	expect(hostDisplay(undefined, { hostedById: BO })).toEqual({
		name: undefined,
		loading: true,
	});
	expect(hostDisplay(undefined, { hostedBy: "Old" })).toEqual({
		name: "Old",
		loading: false,
	});
});
