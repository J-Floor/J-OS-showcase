import { describe, expect, it } from "vitest";

import { LOCK_CAPABILITIES } from "./doorLocks.ts";

describe("LOCK_CAPABILITIES", () => {
	it("lets only the upstairs door be locked from the app", () => {
		// Downstairs only releases the street door, which locks by itself.
		expect(LOCK_CAPABILITIES).toEqual({
			downstairs: { canLock: false, momentary: true },
			upstairs: { canLock: true, momentary: false },
		});
	});
});
