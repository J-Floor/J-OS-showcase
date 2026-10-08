import { describe, expect, it } from "vitest";

import { unreadBadge } from "./unread.ts";

describe("unreadBadge", () => {
	it("shows no badge before the count loads or at zero", () => {
		expect(unreadBadge(undefined)).toBeUndefined();
		expect(unreadBadge(0)).toBeUndefined();
	});

	it("shows the count up to the cap", () => {
		expect(unreadBadge(1)).toBe("1");
		expect(unreadBadge(99)).toBe("99");
	});

	it("shows 99+ past the cap", () => {
		expect(unreadBadge(100)).toBe("99+");
	});
});
