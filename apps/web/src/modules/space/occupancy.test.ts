import { expect, test } from "vitest";

import { occupancyFill, occupancyLevel } from "./occupancy.ts";

test("fill is the clamped count/capacity ratio", () => {
	expect(occupancyFill(20, 40)).toBe(0.5);
	expect(occupancyFill(50, 40)).toBe(1); // clamps over capacity
	expect(occupancyFill(-3, 40)).toBe(0); // clamps below zero
	expect(occupancyFill(5, 0)).toBe(0); // guards divide-by-zero
});

test("level labels the gauge by thirds of the fill", () => {
	expect(occupancyLevel(0)).toBe("Low");
	expect(occupancyLevel(0.32)).toBe("Low");
	expect(occupancyLevel(0.34)).toBe("Medium");
	expect(occupancyLevel(0.65)).toBe("Medium");
	expect(occupancyLevel(0.67)).toBe("High");
	expect(occupancyLevel(1)).toBe("High");
});

test("level is Unknown when there is no reading", () => {
	expect(occupancyLevel(null)).toBe("Unknown");
});
