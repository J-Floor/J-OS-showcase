import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
	startPairing: vi.fn(),
	pollPairing: vi.fn(),
	fetchManifest: vi.fn(),
	fetchSlide: vi.fn(),
	fetchPack: vi.fn(),
}));
vi.mock("./api.ts", () => api);

const syncMock = vi.hoisted(() => ({
	runSync: vi.fn(),
	stop: vi.fn(),
}));
vi.mock("./sync.ts", () => ({ runSync: syncMock.runSync }));

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
	syncMock.runSync.mockReturnValue({ stop: syncMock.stop });
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

const ALWAYS_OFF = Array.from({ length: 7 }, () => ({ closed: true }));

type SyncOptions = {
	onSchedule: (schedule: unknown) => void;
	onUnauthorized: () => void;
};

async function bootSynced(): Promise<{
	app: HTMLElement;
	options: SyncOptions;
}> {
	localStorage.setItem("jfloor-tv-token", "tok");
	await import("./main.ts");
	const app = document.querySelector<HTMLElement>("#app");
	if (!app) throw new Error("no app");
	const options = syncMock.runSync.mock.calls[0]?.[0] as SyncOptions;
	return { app, options };
}

it("wires a power controller to the sync's schedule", async () => {
	const { app, options } = await bootSynced();
	expect(app.classList.contains("screen-off")).toBe(false);
	options.onSchedule(ALWAYS_OFF);
	expect(app.classList.contains("screen-off")).toBe(true);
	options.onSchedule(undefined);
	expect(app.classList.contains("screen-off")).toBe(false);
});

it("going back to pairing stops the controller and uncovers the screen", async () => {
	const { app, options } = await bootSynced();
	options.onSchedule(ALWAYS_OFF);
	expect(app.classList.contains("screen-off")).toBe(true);
	options.onUnauthorized();
	await vi.advanceTimersByTimeAsync(0);
	expect(app.classList.contains("screen-off")).toBe(false);
	expect(app.querySelector(".qr")).not.toBeNull();
	// The stopped controller no longer reacts, even to a visibility change.
	document.dispatchEvent(new Event("visibilitychange"));
	expect(app.classList.contains("screen-off")).toBe(false);
});

it("a schedule arriving after the return to pairing leaves the screen uncovered", async () => {
	const { app, options } = await bootSynced();
	options.onUnauthorized();
	await vi.advanceTimersByTimeAsync(0);
	options.onSchedule(ALWAYS_OFF);
	expect(app.classList.contains("screen-off")).toBe(false);
});
