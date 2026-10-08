// apps/web/convex/emails/format.test.ts
import { describe, expect, it } from "vitest";

import { formatEmailDate } from "./format.ts";

describe("formatEmailDate", () => {
	it("formats an epoch-ms timestamp as a UTC long date", () => {
		// 2026-06-18T10:00:00Z
		expect(formatEmailDate(Date.UTC(2026, 5, 18, 10, 0, 0))).toBe(
			"18 June 2026"
		);
	});

	it("uses UTC so the date doesn't shift near midnight", () => {
		// 2026-12-31T23:30:00Z stays 31 December regardless of host TZ
		expect(formatEmailDate(Date.UTC(2026, 11, 31, 23, 30, 0))).toBe(
			"31 December 2026"
		);
	});
});
