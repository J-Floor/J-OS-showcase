import { expect, it } from "vitest";

import type { Id } from "../../../convex/_generated/dataModel";

import { staffName } from "./boardLevel.tsx";

const ADA = "p1" as Id<"people">;
const staff = [{ _id: ADA, firstName: "Ada", lastName: " " }];

it("is undefined while the list loads", () => {
	expect(staffName(undefined, ADA)).toBeUndefined();
});

it("is the trimmed full name of a listed person", () => {
	expect(staffName(staff, ADA)).toBe("Ada");
});

it("is null for someone not on the list", () => {
	expect(staffName(staff, "p2" as Id<"people">)).toBeNull();
});
