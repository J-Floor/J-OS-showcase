import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	startPairing: vi.fn(),
	pollPairing: vi.fn(),
	fetchManifest: vi.fn(),
	fetchSlide: vi.fn(),
	fetchPack: vi.fn(),
}));
vi.mock("./api.ts", () => api);

beforeEach(() => {
	vi.useFakeTimers();
	vi.resetModules();
	document.body.innerHTML = '<div id="app"><p>stale</p></div>';
	api.startPairing.mockResolvedValue({
		code: "abcdef",
		pollSecret: "s",
		expiresAt: 0,
	});
	api.pollPairing.mockResolvedValue({ status: "pending" });
});

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
	localStorage.clear();
});

it("boots into pairing on a TV without Element.replaceChildren (Chrome 76)", async () => {
	expect(
		(Element.prototype as { replaceChildren?: unknown }).replaceChildren
	).toBeUndefined();
	await import("./main.ts");
	await vi.advanceTimersByTimeAsync(0);
	const app = document.querySelector("#app");
	expect(app?.querySelector(".qr")).not.toBeNull();
	expect(app?.textContent).not.toContain("stale");
});
