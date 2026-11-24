import { describe, expect, it } from "vitest";

import { DAY_MS } from "../constants.ts";

import { TV_EVENT_CUTOFF_DAYS, tvCutoff } from "./eventCutoff.ts";

describe("tvCutoff", () => {
	it("defaults to five days after the event ends", () => {
		expect(TV_EVENT_CUTOFF_DAYS).toBe(5);
		expect(tvCutoff({ endsAt: 1_000_000, tvUntil: undefined })).toBe(
			1_000_000 + 5 * DAY_MS
		);
	});
	it("uses the configured cutoff when set", () => {
		expect(tvCutoff({ endsAt: 1_000_000, tvUntil: 42 })).toBe(42);
	});
});
