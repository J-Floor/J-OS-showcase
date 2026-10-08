import { describe, expect, it } from "vitest";

import { toDoorText } from "./doorLog.ts";

describe("toDoorText", () => {
	const REQUESTED_AT = new Date(2026, 9, 8, 12, 0).getTime();

	it("gives the time the door took to react, in seconds with one decimal", () => {
		expect(
			toDoorText({
				actuation: "actuated",
				requestedAt: REQUESTED_AT,
				actuatedAt: REQUESTED_AT + 2400,
			})
		).toBe("2.4s");
	});

	it("rounds to one decimal", () => {
		expect(
			toDoorText({
				actuation: "actuated",
				requestedAt: REQUESTED_AT,
				actuatedAt: REQUESTED_AT + 1960,
			})
		).toBe("2.0s");
	});

	it("reads No response when the door never reacted", () => {
		expect(
			toDoorText({ actuation: "unconfirmed", requestedAt: REQUESTED_AT })
		).toBe("No response");
	});

	it("reads Waiting… while the door is still being watched", () => {
		expect(
			toDoorText({ actuation: "accepted", requestedAt: REQUESTED_AT })
		).toBe("Waiting…");
	});

	it("is empty for a row with no attempt", () => {
		expect(toDoorText({})).toBe("");
	});
});
