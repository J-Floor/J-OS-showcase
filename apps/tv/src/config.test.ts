import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBase, appBase } from "./config.ts";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("config", () => {
	it("strips trailing slashes from both base URLs", () => {
		vi.stubEnv("VITE_TV_API_URL", "https://api.example.com/");
		vi.stubEnv("VITE_TV_APP_URL", "https://app.example.com//");
		expect(apiBase()).toBe("https://api.example.com");
		expect(appBase()).toBe("https://app.example.com");
	});

	it("leaves a clean URL alone", () => {
		expect(apiBase()).toBe("https://api.example.com");
	});
});
