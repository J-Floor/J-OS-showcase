import { describe, expect, it } from "vitest";

import { lockHealthSummary } from "./lockHealth.ts";

describe("lockHealthSummary", () => {
	it("reports every door online when nothing is unavailable", () => {
		const summary = lockHealthSummary({ configured: 2, unavailable: [] });
		expect(summary.value).toBe("2/2");
		expect(summary.tone).toBe("neutral");
		expect(summary.detail).toBe("Every door is online.");
	});

	it("flags an offline door by name with an error tone", () => {
		const summary = lockHealthSummary({
			configured: 2,
			unavailable: [{ name: "Upstairs" }],
		});
		expect(summary.value).toBe("1/2");
		expect(summary.tone).toBe("error");
		expect(summary.detail).toContain("Upstairs");
		expect(summary.detail).toContain("offline");
	});

	it("lists several offline doors, comma-separated", () => {
		const summary = lockHealthSummary({
			configured: 3,
			unavailable: [{ name: "Upstairs" }, { name: "Downstairs" }],
		});
		expect(summary.value).toBe("1/3");
		expect(summary.tone).toBe("error");
		expect(summary.detail).toContain("Upstairs, Downstairs");
	});
});
