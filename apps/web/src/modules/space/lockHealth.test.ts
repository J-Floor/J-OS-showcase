import type { FunctionReturnType } from "convex/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { api } from "../../../convex/_generated/api";

import { lockHealthSummary, type DoorHealth } from "./lockHealth.ts";

it("DoorHealth is what the door-health action returns", () => {
	expectTypeOf<DoorHealth>().toEqualTypeOf<
		FunctionReturnType<typeof api.doorHealth.doorHealth>
	>();
});

describe("lockHealthSummary", () => {
	it("reports every door online when nothing is unavailable", () => {
		const summary = lockHealthSummary({
			configured: 2,
			unavailable: [],
		});
		expect(summary.value).toBe("2/2");
		expect(summary.tone).toBe("neutral");
	});

	it("flags an offline door by name with an error tone", () => {
		const summary = lockHealthSummary({
			configured: 2,
			unavailable: [{ name: "Upstairs" }],
		});
		expect(summary.value).toBe("1/2");
		expect(summary.tone).toBe("error");
	});

	it("lists several offline doors, comma-separated", () => {
		const summary = lockHealthSummary({
			configured: 3,
			unavailable: [{ name: "Upstairs" }, { name: "Downstairs" }],
		});
		expect(summary.value).toBe("1/3");
		expect(summary.tone).toBe("error");
	});
});
