import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest } from "./api.ts";

const api = vi.hoisted(() => ({
	fetchManifest: vi.fn<(token: string) => Promise<Manifest | "unauthorized">>(),
	fetchSlide: vi.fn<(token: string, source: string) => Promise<Blob | "unauthorized" | "missing">>(),
}));
vi.mock("./api.ts", () => api);

const { runSync } = await import("./sync.ts");
const { storage } = await import("./storage.ts");

type Entry = Manifest["slides"][number];

function slide(id: string, kind: Entry["kind"], rev = 1): Entry {
	return { id, kind, durationSec: 10, rev, src: `/tv/slide?id=${id}` };
}

function manifest(version: number, slides: Entry[]): Manifest {
	return { version, transition: "slide", slides };
}

const player = { setSlides: vi.fn(), setTransition: vi.fn() };
const createUrl = vi.fn<(blob: Blob) => string>();
const revokeUrl = vi.fn<(url: string) => void>();
let root: HTMLElement;
let urlCount: number;

function body(id: string, rev: number): Blob {
	return new Blob([`${id}-${rev}`], { type: id.startsWith("img") ? "image/png" : "text/html" });
}

beforeEach(() => {
	vi.useFakeTimers();
	root = document.createElement("div");
	urlCount = 0;
	createUrl.mockImplementation(() => {
		urlCount += 1;
		return `blob:fake-${urlCount}`;
	});
	vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
	api.fetchSlide.mockImplementation((_token, source) => {
		const id = new URL(source, "https://x.example.com").searchParams.get("id") ?? "";
		const rev = revs.get(id) ?? 1;
		return Promise.resolve(body(id, rev));
	});
});

const revs = new Map<string, number>();

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
	revs.clear();
});

function start(onUnauthorized = vi.fn()) {
	return { onUnauthorized, sync: runSync({ token: "tok", root, player, onUnauthorized }) };
}

describe("runSync", () => {
	it("builds html and image slides and hands them to the player", async () => {
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html"), slide("img1", "image")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(player.setTransition).toHaveBeenCalledWith("slide");
		expect(player.setSlides).toHaveBeenCalledWith([
			{ id: "htm1", kind: "html", durationSec: 10, html: "htm1-1" },
			{ id: "img1", kind: "image", durationSec: 10, imageUrl: "blob:fake-1" },
		]);
		sync.stop();
	});

	it("polls the manifest every 60 seconds and skips slides when the version is unchanged", async () => {
		api.fetchManifest.mockResolvedValue(manifest(1, [slide("htm1", "html")]));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(59_999);
		expect(api.fetchManifest).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(api.fetchManifest).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(3);
		expect(api.fetchSlide).toHaveBeenCalledTimes(1);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("refetches only slides whose rev changed or that are new", async () => {
		api.fetchManifest.mockResolvedValueOnce(
			manifest(1, [slide("htm1", "html"), slide("htm2", "html"), slide("img1", "image")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(api.fetchSlide).toHaveBeenCalledTimes(3);
		revs.set("htm2", 2);
		api.fetchManifest.mockResolvedValue(
			manifest(2, [
				slide("htm1", "html"),
				slide("htm2", "html", 2),
				slide("img1", "image"),
				slide("htm3", "html"),
			])
		);
		await vi.advanceTimersByTimeAsync(60_000);
		const refetched = api.fetchSlide.mock.calls.slice(3).map(([, source]) => source);
		expect(refetched).toEqual(["/tv/slide?id=htm2", "/tv/slide?id=htm3"]);
		const last = player.setSlides.mock.calls.at(-1)?.[0] as { id: string; html?: string }[];
		expect(last.map((entry) => entry.id)).toEqual(["htm1", "htm2", "img1", "htm3"]);
		expect(last[1]?.html).toBe("htm2-2");
		sync.stop();
	});

	it("revokes object URLs of replaced and removed images, not kept ones", async () => {
		api.fetchManifest.mockResolvedValueOnce(
			manifest(1, [slide("img1", "image"), slide("img2", "image")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		revs.set("img1", 2);
		api.fetchManifest.mockResolvedValue(manifest(2, [slide("img1", "image", 2)]));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledTimes(2);
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-1");
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-2");
		sync.stop();
	});

	it("keeps the previous slides when the network fails, then recovers", async () => {
		api.fetchManifest.mockResolvedValueOnce(manifest(1, [slide("htm1", "html")]));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockRejectedValueOnce(new Error("offline"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		api.fetchManifest.mockResolvedValue(manifest(2, [slide("htm1", "html"), slide("htm2", "html")]));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("keeps the previous slides when a slide fetch fails, without refetching the ones that worked", async () => {
		api.fetchManifest.mockResolvedValueOnce(manifest(1, [slide("htm1", "html")]));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		const next = manifest(2, [slide("htm1", "html"), slide("htm2", "html"), slide("htm3", "html")]);
		api.fetchManifest.mockResolvedValue(next);
		api.fetchSlide.mockImplementationOnce((_token, source) =>
			Promise.resolve(body(source.slice(-4), 1))
		);
		api.fetchSlide.mockRejectedValueOnce(new Error("429"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		const refetched = api.fetchSlide.mock.calls.slice(1).map(([, source]) => source);
		expect(refetched).toEqual(["/tv/slide?id=htm2", "/tv/slide?id=htm3", "/tv/slide?id=htm3"]);
		expect(player.setSlides).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("clears the token and re-enters pairing on unauthorized", async () => {
		storage.setToken("tok");
		api.fetchManifest.mockResolvedValue("unauthorized");
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(storage.getToken()).toBeNull();
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("treats an unauthorized slide like an unauthorized manifest", async () => {
		storage.setToken("tok");
		api.fetchManifest.mockResolvedValue(manifest(1, [slide("htm1", "html")]));
		api.fetchSlide.mockResolvedValue("unauthorized");
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(storage.getToken()).toBeNull();
		expect(player.setSlides).not.toHaveBeenCalled();
		sync.stop();
	});

	it("shows the idle screen for an empty manifest and hides it once slides arrive", async () => {
		api.fetchManifest.mockResolvedValueOnce(manifest(1, []));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		const idle = root.querySelector<HTMLElement>(".idle");
		expect(idle?.textContent).toBe("Nothing to show yet");
		expect(idle?.hidden).toBe(false);
		expect(player.setSlides).toHaveBeenCalledWith([]);
		api.fetchManifest.mockResolvedValue(manifest(2, [slide("htm1", "html")]));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(idle?.hidden).toBe(true);
		sync.stop();
	});

	it("stops polling after stop()", async () => {
		api.fetchManifest.mockResolvedValue(manifest(1, []));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		sync.stop();
		await vi.advanceTimersByTimeAsync(180_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(1);
	});

	it("skips a slide that returns 404 and still updates the rest", async () => {
		api.fetchManifest.mockResolvedValue(manifest(1, [slide("htm1", "html"), slide("htm2", "html")]));
		api.fetchSlide.mockImplementation((_token, source) =>
			Promise.resolve(source.endsWith("htm1") ? "missing" : body("htm2", 1))
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(player.setSlides).toHaveBeenCalledWith([
			{ id: "htm2", kind: "html", durationSec: 10, html: "htm2-1" },
		]);
		sync.stop();
	});

	it("revokes a fetched image that a retry replaces at a newer rev", async () => {
		api.fetchManifest.mockResolvedValueOnce(manifest(1, [slide("htm1", "html")]));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValueOnce(manifest(2, [slide("img1", "image"), slide("htm2", "html")]));
		api.fetchSlide.mockImplementationOnce(() => Promise.resolve(body("img1", 1)));
		api.fetchSlide.mockRejectedValueOnce(new Error("503"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).not.toHaveBeenCalled();
		api.fetchManifest.mockResolvedValue(manifest(3, [slide("img1", "image", 2), slide("htm2", "html")]));
		revs.set("img1", 2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-1");
		sync.stop();
	});

	it("revokes a download that finishes after stop() instead of keeping it", async () => {
		api.fetchManifest.mockResolvedValue(manifest(1, [slide("img1", "image")]));
		const pending = Promise.withResolvers<Blob>();
		api.fetchSlide.mockImplementation(() => pending.promise);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		sync.stop();
		pending.resolve(body("img1", 1));
		await vi.advanceTimersByTimeAsync(0);
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-1");
		expect(player.setSlides).not.toHaveBeenCalled();
	});
});
