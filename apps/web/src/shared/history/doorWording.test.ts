import { describe, expect, it } from "vitest";

import {
	doorActionLabel,
	OPERATION_LABEL,
	OUTCOME_LABEL,
} from "./doorWording.ts";

describe("doorWording", () => {
	it("keeps the log's short column words", () => {
		expect(OPERATION_LABEL.unlock).toBe("Unlock");
		expect(OUTCOME_LABEL["dry-run"]).toBe("Dry run");
	});

	it("words an unlock, a lock and a failure for the timeline", () => {
		expect(doorActionLabel("unlock", "downstairs", "ok")).toBe(
			"Unlocked the Downstairs door"
		);
		expect(doorActionLabel("lock", "upstairs", "ok")).toBe(
			"Locked the Upstairs door"
		);
		expect(doorActionLabel("unlock", undefined, "failed")).toBe(
			"Tried to unlock a door — failed"
		);
	});
});
