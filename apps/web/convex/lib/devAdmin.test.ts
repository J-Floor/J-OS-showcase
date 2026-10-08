import { afterEach, describe, expect, it, vi } from "vitest";

import { devAdminEmail } from "./devAdmin.ts";

describe("devAdminEmail", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns DEV_ADMIN_EMAIL when set", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", "me@jfloor.test");
		expect(devAdminEmail()).toBe("me@jfloor.test");
	});

	it("falls back to admin@example.com", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", undefined);
		expect(devAdminEmail()).toBe("admin@example.com");
	});

	it("treats an empty DEV_ADMIN_EMAIL as unset", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", "");
		expect(devAdminEmail()).toBe("admin@example.com");
	});
});
