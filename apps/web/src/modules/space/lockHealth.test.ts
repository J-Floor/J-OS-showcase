import { describe, expect, it } from "vitest";

import { lockHealthSummary } from "./lockHealth.ts";

describe("lockHealthSummary", () => {
	it("reports every door online when nothing is unavailable", () => {
		const s = lockHealthSummary({ configured: 2, unavailable: [] });
		expect(s.value).toBe("2/2");
		expect(s.tone).toBe("neutral");
		expect(s.detail).toBe("Every door is online.");
	});

	it("flags an offline door by name with an error tone", () => {
		const s = lockHealthSummary({
			configured: 2,
			unavailable: [{ name: "Upstairs" }],
		});
		expect(s.value).toBe("1/2");
		expect(s.tone).toBe("error");
		expect(s.detail).toContain("Upstairs");
		expect(s.detail).toContain("offline");
	});

	it("lists several offline doors, comma-separated", () => {
		const s = lockHealthSummary({
			configured: 3,
			unavailable: [{ name: "Upstairs" }, { name: "Downstairs" }],
		});
		expect(s.value).toBe("1/3");
		expect(s.tone).toBe("error");
		expect(s.detail).toContain("Upstairs, Downstairs");
	});
});
