import { afterEach, describe, expect, it, vi } from "vitest";

import { developmentAdminEmail } from "./devAdmin.ts";

describe("developmentAdminEmail", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns DEV_ADMIN_EMAIL when set", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", "me@jfloor.test");
		expect(developmentAdminEmail()).toBe("me@jfloor.test");
	});

	it("falls back to admin@example.com", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", undefined);
		expect(developmentAdminEmail()).toBe("admin@example.com");
	});

	it("treats an empty DEV_ADMIN_EMAIL as unset", () => {
		vi.stubEnv("DEV_ADMIN_EMAIL", "");
		expect(developmentAdminEmail()).toBe("admin@example.com");
	});
});
