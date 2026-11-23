import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PairingPoll, PairingStart } from "./api.ts";

const api = vi.hoisted(() => ({
	startPairing: vi.fn<() => Promise<PairingStart>>(),
	pollPairing: vi.fn<(secret: string) => Promise<PairingPoll>>(),
}));
vi.mock("./api.ts", () => api);
vi.mock("./qr.ts", () => ({
	renderQr: (payload: string) => {
		const node = document.createElement("div");
		node.className = "fake-qr";
		node.dataset.payload = payload;
		return node;
	},
}));

const { runPairing } = await import("./pairing.ts");
const { storage } = await import("./storage.ts");

const TOKEN = "device-token-never-shown";
const APP_URL = "https://app.example.com";

function pairing(
	code: string,
	expiresIn = 600_000,
	pollSecret = "poll-1"
): PairingStart {
	return { code, pollSecret, expiresAt: Date.now() + expiresIn };
}

let root: HTMLElement;

beforeEach(() => {
	vi.useFakeTimers();
	root = document.createElement("div");
	localStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe("runPairing", () => {
	it("shows the pair URL as the QR payload and the 4-char check code", async () => {
		api.startPairing.mockResolvedValue(pairing("ab12cdef"));
		api.pollPairing.mockResolvedValue({ status: "pending" });
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(0);
		expect(
			root.querySelector<HTMLElement>(".fake-qr")?.dataset.payload
		).toBe(`${APP_URL}/tv/pair?code=ab12cdef`);
		expect(root.querySelector(".check-code")?.textContent).toBe("AB12");
		run.stop();
	});

	it("polls every 2 seconds, stores the token and stops polling once paired", async () => {
		api.startPairing.mockResolvedValue(pairing("ab12cdef"));
		api.pollPairing
			.mockResolvedValueOnce({ status: "pending" })
			.mockResolvedValueOnce({ status: "paired", token: TOKEN });
		const onPaired = vi.fn();
		runPairing({ root, onPaired });
		await vi.advanceTimersByTimeAsync(1999);
		expect(api.pollPairing).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(api.pollPairing).toHaveBeenCalledTimes(1);
		expect(api.pollPairing).toHaveBeenCalledWith("poll-1");
		await vi.advanceTimersByTimeAsync(2000);
		expect(api.pollPairing).toHaveBeenCalledTimes(2);
		expect(storage.getToken()).toBe(TOKEN);
		expect(onPaired).toHaveBeenCalledWith(TOKEN);
		await vi.advanceTimersByTimeAsync(20_000);
		expect(api.pollPairing).toHaveBeenCalledTimes(2);
		expect(api.startPairing).toHaveBeenCalledTimes(1);
	});

	it("never renders the device token", async () => {
		api.startPairing.mockResolvedValue(pairing("ab12cdef"));
		api.pollPairing.mockResolvedValue({ status: "paired", token: TOKEN });
		runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(2000);
		expect(root.innerHTML).not.toContain(TOKEN);
		expect(root.innerHTML).not.toContain("poll-1");
	});

	it("starts a fresh pairing when the poll says expired or unknown", async () => {
		api.startPairing
			.mockResolvedValueOnce(pairing("aaaa1111"))
			.mockResolvedValueOnce(pairing("bbbb2222", 600_000, "poll-2"))
			.mockResolvedValueOnce(pairing("cccc3333", 600_000, "poll-3"));
		api.pollPairing
			.mockResolvedValueOnce({ status: "expired" })
			.mockResolvedValueOnce({ status: "unknown" })
			.mockResolvedValue({ status: "pending" });
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(2000);
		expect(root.querySelector(".check-code")?.textContent).toBe("BBBB");
		await vi.advanceTimersByTimeAsync(2000);
		expect(root.querySelector(".check-code")?.textContent).toBe("CCCC");
		expect(api.pollPairing).toHaveBeenLastCalledWith("poll-2");
		run.stop();
	});

	it("starts a fresh pairing once the local lifetime has passed", async () => {
		api.startPairing
			.mockResolvedValueOnce(pairing("aaaa1111"))
			.mockResolvedValueOnce(pairing("bbbb2222", 600_000, "poll-2"));
		api.pollPairing.mockResolvedValue({ status: "pending" });
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(590_000);
		expect(api.startPairing).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(12_000);
		expect(api.startPairing).toHaveBeenCalledTimes(2);
		expect(root.querySelector(".check-code")?.textContent).toBe("BBBB");
		run.stop();
	});

	it("ignores the server's expiresAt, so a TV clock an hour ahead does not restart every poll", async () => {
		api.startPairing.mockResolvedValue(pairing("aaaa1111", -3_600_000));
		api.pollPairing.mockResolvedValue({ status: "pending" });
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(20_000);
		expect(api.startPairing).toHaveBeenCalledTimes(1);
		expect(api.pollPairing).toHaveBeenCalledTimes(10);
		run.stop();
	});

	it("keeps polling after a network failure", async () => {
		api.startPairing.mockResolvedValue(pairing("ab12cdef"));
		api.pollPairing
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ status: "paired", token: TOKEN });
		const onPaired = vi.fn();
		runPairing({ root, onPaired });
		await vi.advanceTimersByTimeAsync(4000);
		expect(onPaired).toHaveBeenCalledWith(TOKEN);
	});

	it("backs off for a minute when starting a pairing fails, then retries", async () => {
		api.startPairing
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce(pairing("ab12cdef"));
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(59_000);
		expect(api.startPairing).toHaveBeenCalledTimes(1);
		expect(root.querySelector(".check-code")).toBeNull();
		await vi.advanceTimersByTimeAsync(1000);
		expect(api.startPairing).toHaveBeenCalledTimes(2);
		expect(root.querySelector(".check-code")?.textContent).toBe("AB12");
		run.stop();
	});

	it("stops polling after stop()", async () => {
		api.startPairing.mockResolvedValue(pairing("ab12cdef"));
		api.pollPairing.mockResolvedValue({ status: "pending" });
		const run = runPairing({ root, onPaired: vi.fn() });
		await vi.advanceTimersByTimeAsync(2000);
		run.stop();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(api.pollPairing).toHaveBeenCalledTimes(1);
	});
});
