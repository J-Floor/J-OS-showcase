import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Manifest, PackDownload } from "./api.ts";

const api = vi.hoisted(() => ({
	fetchManifest:
		vi.fn<
			(
				token: string,
				signal?: AbortSignal
			) => Promise<Manifest | "unauthorized">
		>(),
	fetchSlide:
		vi.fn<
			(
				token: string,
				source: string,
				signal?: AbortSignal
			) => Promise<Blob | "unauthorized" | "missing">
		>(),
	fetchPack:
		vi.fn<
			(
				token: string,
				signal?: AbortSignal
			) => Promise<PackDownload | "unauthorized" | "missing">
		>(),
	fetchSchedule:
		vi.fn<
			(
				token: string,
				signal?: AbortSignal
			) => Promise<
				| { xml: string; version: number | undefined }
				| "unauthorized"
				| "missing"
			>
		>(),
}));
vi.mock("./api.ts", () => api);

const packMock = vi.hoisted(() => ({
	loadPack: vi.fn<
		(
			zip: Uint8Array,
			reuse?: ReadonlyMap<string, { key: string; url: string }>
		) => {
			transition: "fade" | "slide" | "none";
			slides: unknown[];
			objectUrls: string[];
			images?: ReadonlyMap<string, { key: string; url: string }>;
		}
	>(),
}));
vi.mock("./pack.ts", () => packMock);

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
	return new Blob([`${id}-${rev}`], {
		type: id.startsWith("img") ? "image/png" : "text/html",
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	root = document.createElement("div");
	urlCount = 0;
	createUrl.mockImplementation(() => {
		urlCount += 1;
		return `blob:fake-${urlCount}`;
	});
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: createUrl,
			revokeObjectURL: revokeUrl,
		})
	);
	api.fetchSlide.mockImplementation((_token, source) => {
		const id =
			new URL(source, "https://x.example.com").searchParams.get("id") ??
			"";
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
	return {
		onUnauthorized,
		sync: runSync({ token: "tok", root, player, onUnauthorized }),
	};
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
			{
				id: "img1",
				kind: "image",
				durationSec: 10,
				imageUrl: "blob:fake-1",
			},
		]);
		sync.stop();
	});

	it("polls the manifest every 60 seconds and skips slides when the version is unchanged", async () => {
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html")])
		);
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
			manifest(1, [
				slide("htm1", "html"),
				slide("htm2", "html"),
				slide("img1", "image"),
			])
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
		const refetched = api.fetchSlide.mock.calls
			.slice(3)
			.map(([, source]) => source);
		expect(refetched).toEqual(["/tv/slide?id=htm2", "/tv/slide?id=htm3"]);
		const last = player.setSlides.mock.calls.at(-1)?.[0] as {
			id: string;
			html?: string;
		}[];
		expect(last.map((entry) => entry.id)).toEqual([
			"htm1",
			"htm2",
			"img1",
			"htm3",
		]);
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
		api.fetchManifest.mockResolvedValue(
			manifest(2, [slide("img1", "image", 2)])
		);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledTimes(2);
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-1");
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-2");
		sync.stop();
	});

	it("keeps the previous slides when the network fails, then recovers", async () => {
		api.fetchManifest.mockResolvedValueOnce(
			manifest(1, [slide("htm1", "html")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockRejectedValueOnce(new Error("offline"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		api.fetchManifest.mockResolvedValue(
			manifest(2, [slide("htm1", "html"), slide("htm2", "html")])
		);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("keeps the previous slides when a slide fetch fails, without refetching the ones that worked", async () => {
		api.fetchManifest.mockResolvedValueOnce(
			manifest(1, [slide("htm1", "html")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		const next = manifest(2, [
			slide("htm1", "html"),
			slide("htm2", "html"),
			slide("htm3", "html"),
		]);
		api.fetchManifest.mockResolvedValue(next);
		api.fetchSlide.mockImplementationOnce((_token, source) =>
			Promise.resolve(body(source.slice(-4), 1))
		);
		api.fetchSlide.mockRejectedValueOnce(new Error("429"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		const refetched = api.fetchSlide.mock.calls
			.slice(1)
			.map(([, source]) => source);
		expect(refetched).toEqual([
			"/tv/slide?id=htm2",
			"/tv/slide?id=htm3",
			"/tv/slide?id=htm3",
		]);
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

	it("fetches the schedule once when the manifest advertises a new version", async () => {
		api.fetchManifest.mockResolvedValue({
			...manifest(1, [slide("htm1", "html")]),
			scheduleVersion: 2,
		});
		api.fetchSchedule.mockResolvedValue({
			xml: '<schedule><day name="mon" off="all"/></schedule>',
			version: 2,
		});
		const onSchedule = vi.fn();
		const sync = runSync({
			token: "tok",
			root,
			player,
			onUnauthorized: vi.fn(),
			onSchedule,
		});
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(1);
		expect(onSchedule).toHaveBeenCalledTimes(1);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("keeps playing slides when the schedule fetch fails", async () => {
		api.fetchManifest.mockResolvedValue({
			...manifest(1, [slide("htm1", "html")]),
			scheduleVersion: 2,
		});
		api.fetchSchedule.mockRejectedValue(new Error("down"));
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnauthorized).not.toHaveBeenCalled();
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("clears the stored schedule with the token on unauthorized", async () => {
		storage.setToken("tok");
		storage.setSchedule('<schedule><day name="mon" off="all"/></schedule>');
		api.fetchManifest.mockResolvedValue("unauthorized");
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(storage.getSchedule()).toBeNull();
		const onSchedule = vi.fn();
		const next = runSync({
			token: "tok",
			root,
			player,
			onUnauthorized: vi.fn(),
			onSchedule,
		});
		expect(onSchedule).not.toHaveBeenCalled();
		next.stop();
		sync.stop();
	});

	it("calls onTick after each successful manifest, not after a 401", async () => {
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html")])
		);
		const onTick = vi.fn();
		const sync = runSync({
			token: "tok",
			root,
			player,
			onUnauthorized: vi.fn(),
			onTick,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onTick).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(onTick).toHaveBeenCalledTimes(2);
		sync.stop();
		api.fetchManifest.mockResolvedValue("unauthorized");
		const denied = vi.fn();
		const second = runSync({
			token: "tok",
			root,
			player,
			onUnauthorized: vi.fn(),
			onTick: denied,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(denied).not.toHaveBeenCalled();
		second.stop();
	});

	it("treats an unauthorized schedule like an unauthorized manifest", async () => {
		storage.setToken("tok");
		api.fetchManifest.mockResolvedValue({
			...manifest(1, [slide("htm1", "html")]),
			scheduleVersion: 2,
		});
		api.fetchSchedule.mockResolvedValue("unauthorized");
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(storage.getToken()).toBeNull();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("expires on a schedule 401 after an earlier successful schedule", async () => {
		storage.setToken("tok");
		api.fetchManifest
			.mockResolvedValueOnce({
				...manifest(1, [slide("htm1", "html")]),
				scheduleVersion: 1,
			})
			.mockResolvedValue({
				...manifest(1, [slide("htm1", "html")]),
				scheduleVersion: 2,
			});
		api.fetchSchedule
			.mockResolvedValueOnce({
				xml: '<schedule><day name="mon" off="all"/></schedule>',
				version: 1,
			})
			.mockResolvedValue("unauthorized");
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnauthorized).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(storage.getToken()).toBeNull();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("keeps slides playing and the timer armed when onSchedule throws", async () => {
		storage.clearSchedule();
		api.fetchManifest.mockResolvedValue({
			...manifest(1, [slide("htm1", "html")]),
			scheduleVersion: 2,
		});
		api.fetchSchedule.mockResolvedValue({
			xml: '<schedule><day name="mon" off="all"/></schedule>',
			version: 2,
		});
		const onSchedule = vi.fn(() => {
			throw new Error("controller broke");
		});
		const onUnauthorized = vi.fn();
		const sync = runSync({
			token: "tok",
			root,
			player,
			onUnauthorized,
			onSchedule,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onSchedule).toHaveBeenCalledTimes(1);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchManifest).toHaveBeenCalledTimes(2);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(1);
		expect(onUnauthorized).not.toHaveBeenCalled();
		sync.stop();
	});

	it("applies a new manifest while the schedule fetch is still pending", async () => {
		api.fetchManifest.mockResolvedValue({
			...manifest(1, [slide("htm1", "html")]),
			scheduleVersion: 2,
		});
		api.fetchSchedule.mockImplementation(
			() =>
				new Promise<never>(() => {
					// Never settles: a hung schedule request.
				})
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(api.fetchSchedule).toHaveBeenCalledTimes(1);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("treats an unauthorized slide like an unauthorized manifest", async () => {
		storage.setToken("tok");
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html")])
		);
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
		api.fetchManifest.mockResolvedValue(
			manifest(2, [slide("htm1", "html")])
		);
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
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html"), slide("htm2", "html")])
		);
		api.fetchSlide.mockImplementation((_token, source) =>
			Promise.resolve(
				source.endsWith("htm1") ? "missing" : body("htm2", 1)
			)
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(player.setSlides).toHaveBeenCalledWith([
			{ id: "htm2", kind: "html", durationSec: 10, html: "htm2-1" },
		]);
		sync.stop();
	});

	it("revokes a fetched image that a retry replaces at a newer rev", async () => {
		api.fetchManifest.mockResolvedValueOnce(
			manifest(1, [slide("htm1", "html")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValueOnce(
			manifest(2, [slide("img1", "image"), slide("htm2", "html")])
		);
		api.fetchSlide.mockImplementationOnce(() =>
			Promise.resolve(body("img1", 1))
		);
		api.fetchSlide.mockRejectedValueOnce(new Error("503"));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).not.toHaveBeenCalled();
		api.fetchManifest.mockResolvedValue(
			manifest(3, [slide("img1", "image", 2), slide("htm2", "html")])
		);
		revs.set("img1", 2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledWith("blob:fake-1");
		sync.stop();
	});

	it("revokes a download that finishes after stop() instead of keeping it", async () => {
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("img1", "image")])
		);
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

function packManifest(version: number, packVersion: number | null): Manifest {
	return {
		version,
		transition: "fade",
		packVersion,
		slides: [slide("old1", "html")],
	};
}

function breakPack(): void {
	packMock.loadPack.mockImplementation(() => {
		throw new Error("broken");
	});
}

describe("runSync with packs", () => {
	const ZIP = new Uint8Array([80, 75]);
	function download(version: number | undefined): PackDownload {
		return { zip: ZIP, version };
	}

	it("downloads the pack when packVersion changes and plays it, not the slide list", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValue({
			transition: "none",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:p1"],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(packMock.loadPack).toHaveBeenCalledWith(ZIP, undefined);
		expect(player.setTransition).toHaveBeenCalledWith("none");
		expect(player.setSlides).toHaveBeenCalledWith([{ id: "p1" }]);
		expect(api.fetchSlide).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchPack).toHaveBeenCalledTimes(1);
		sync.stop();
		expect(revokeUrl).toHaveBeenCalledWith("blob:p1");
	});

	it("stores the version from the download, so a rebuild between manifest and download is not re-downloaded", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [],
			objectUrls: [],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchPack).toHaveBeenCalledTimes(1);
		api.fetchManifest.mockResolvedValue(packManifest(3, 6));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("falls back to the manifest's number when the download carries no version", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(undefined));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [],
			objectUrls: [],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(api.fetchPack).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("replaces the pack on a new packVersion and revokes the old URLs", async () => {
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValueOnce(download(4));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [],
			objectUrls: ["blob:p1"],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [{ id: "p2" }],
			objectUrls: ["blob:p2"],
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledWith("blob:p1");
		expect(revokeUrl).not.toHaveBeenCalledWith("blob:p2");
		sync.stop();
	});

	const GOOD = {
		transition: "fade" as const,
		slides: [{ id: "p1" }],
		objectUrls: [],
	};
	const MIN = 60_000;

	function startWithGoodPack4(): ReturnType<typeof start> {
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValueOnce(GOOD);
		return start();
	}

	it("keeps the last good pack when the new one is broken, and does not refetch that version on the next polls", async () => {
		const { sync } = startWithGoodPack4();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		breakPack();
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(3 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("retries the failed version after 5 minutes, then 10, doubling up to an hour", async () => {
		const { sync } = startWithGoodPack4();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		breakPack();
		const fetchedAt: number[] = [];
		let seen = api.fetchPack.mock.calls.length;
		for (let minute = 1; minute <= 260; minute += 1) {
			await vi.advanceTimersByTimeAsync(MIN);
			if (api.fetchPack.mock.calls.length > seen) fetchedAt.push(minute);
			seen = api.fetchPack.mock.calls.length;
		}
		const gaps = fetchedAt
			.slice(1)
			.map((at, index) => at - (fetchedAt[index] ?? 0));
		expect(gaps).toEqual([5, 10, 20, 40, 60, 60, 60]);
		sync.stop();
	});

	it("fetches a new version at once, even inside the backoff of the failed one", async () => {
		const { sync } = startWithGoodPack4();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		breakPack();
		await vi.advanceTimersByTimeAsync(MIN);
		api.fetchManifest.mockResolvedValue(packManifest(3, 6));
		api.fetchPack.mockResolvedValue(download(6));
		packMock.loadPack.mockReset();
		packMock.loadPack.mockReturnValueOnce({
			...GOOD,
			slides: [{ id: "p6" }],
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(player.setSlides).toHaveBeenLastCalledWith([{ id: "p6" }]);
		sync.stop();
	});

	it("resets the backoff after a success", async () => {
		const { sync } = startWithGoodPack4();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		breakPack();
		await vi.advanceTimersByTimeAsync(MIN);
		await vi.advanceTimersByTimeAsync(5 * MIN);
		await vi.advanceTimersByTimeAsync(11 * MIN);
		// Failures of version 5 so far: 3, the next wait would be 20 minutes.
		expect(api.fetchPack).toHaveBeenCalledTimes(4);
		api.fetchManifest.mockResolvedValue(packManifest(3, 6));
		api.fetchPack.mockResolvedValue(download(6));
		packMock.loadPack.mockReset();
		packMock.loadPack.mockReturnValueOnce(GOOD);
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(5);
		// Version 7 breaks: its first wait is 5 minutes again, not 40.
		api.fetchManifest.mockResolvedValue(packManifest(4, 7));
		api.fetchPack.mockResolvedValue(download(7));
		breakPack();
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(6);
		await vi.advanceTimersByTimeAsync(5 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(7);
		sync.stop();
	});

	it("keeps the last pack on a network error or a 429 on the download", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack
			.mockResolvedValueOnce(download(4))
			.mockRejectedValueOnce(new Error("429"));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:p1"],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		expect(revokeUrl).not.toHaveBeenCalled();
		sync.stop();
	});

	it("waits while the pack is not built yet (404)", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack.mockResolvedValue("missing");
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).not.toHaveBeenCalled();
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("re-enters pairing on an unauthorized pack", async () => {
		storage.setToken("tok");
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		api.fetchPack.mockResolvedValue("unauthorized");
		const { sync, onUnauthorized } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(onUnauthorized).toHaveBeenCalledTimes(1);
		expect(storage.getToken()).toBeNull();
		sync.stop();
	});

	it("revokes the pack's URLs when the server falls back to the slide list", async () => {
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:p1"],
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, null));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledWith("blob:p1");
		sync.stop();
	});

	it("leaves the pack for the slide list even at the legacy version it showed before the pack", async () => {
		api.fetchManifest.mockResolvedValueOnce(packManifest(3, null));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValueOnce(packManifest(3, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:p1"],
		});
		await vi.advanceTimersByTimeAsync(60_000);
		expect(player.setSlides).toHaveBeenLastCalledWith([{ id: "p1" }]);
		api.fetchManifest.mockResolvedValue(packManifest(3, null));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(revokeUrl).toHaveBeenCalledWith("blob:p1");
		expect(player.setSlides).toHaveBeenCalledTimes(3);
		sync.stop();
	});

	it("aborts a pack download in flight when stopped", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, 4));
		let signal: AbortSignal | undefined;
		api.fetchPack.mockImplementation((_token, given) => {
			signal = given;
			return new Promise(() => {});
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(signal?.aborted).toBe(false);
		sync.stop();
		expect(signal?.aborted).toBe(true);
	});

	it("still plays the slide list when the server has no pack yet (packVersion null)", async () => {
		api.fetchManifest.mockResolvedValue(packManifest(1, null));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(api.fetchPack).not.toHaveBeenCalled();
		expect(api.fetchSlide).toHaveBeenCalledTimes(1);
		sync.stop();
	});
});

describe("runSync failure handling", () => {
	const ZIP = new Uint8Array([80, 75]);
	const MIN = 60_000;
	const GOOD = {
		transition: "fade" as const,
		slides: [{ id: "p1" }],
		objectUrls: ["blob:p1"],
	};
	function download(version: number | undefined): PackDownload {
		return { zip: ZIP, version };
	}
	async function startWithPack4(): Promise<ReturnType<typeof start>> {
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValueOnce(download(4));
		packMock.loadPack.mockReturnValueOnce(GOOD);
		const started = start();
		await vi.advanceTimersByTimeAsync(0);
		return started;
	}

	it("revokes the new pack's URLs and backs off when the player throws, and keeps the old pack's URLs", async () => {
		const { sync } = await startWithPack4();
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValue({
			transition: "fade",
			slides: [{ id: "p2" }],
			objectUrls: ["blob:p2a", "blob:p2b"],
		});
		player.setSlides.mockImplementationOnce(() => {
			throw new TypeError("replaceChildren is not a function");
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(revokeUrl).toHaveBeenCalledWith("blob:p2a");
		expect(revokeUrl).toHaveBeenCalledWith("blob:p2b");
		expect(revokeUrl).not.toHaveBeenCalledWith("blob:p1");
		// Backoff: not downloaded again for 5 minutes.
		await vi.advanceTimersByTimeAsync(3 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(2 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(3);
		sync.stop();
	});

	it("keeps polling after a player throw, and a later good pack plays", async () => {
		const { sync } = await startWithPack4();
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValue(GOOD);
		player.setTransition.mockImplementationOnce(() => {
			throw new Error("boom");
		});
		await vi.advanceTimersByTimeAsync(MIN);
		api.fetchManifest.mockResolvedValue(packManifest(3, 6));
		api.fetchPack.mockResolvedValue(download(6));
		await vi.advanceTimersByTimeAsync(MIN);
		expect(player.setSlides).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("backs off after a network error or a 5xx on the pack download", async () => {
		const { sync } = await startWithPack4();
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockRejectedValue(new Error("pack failed: 503"));
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(4 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(9 * MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(3);
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(4);
		sync.stop();
	});

	it("records a broken pack under the version it was downloaded at, not the one advertised", async () => {
		const { sync } = await startWithPack4();
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(6));
		packMock.loadPack.mockImplementation(() => {
			throw new Error("broken");
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		// The next manifest advertises 6, the version that was broken: no download.
		api.fetchManifest.mockResolvedValue(packManifest(3, 6));
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		sync.stop();
	});

	it("treats a backoff that lies further ahead than its maximum as expired (the clock jumped back)", async () => {
		vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
		const { sync } = await startWithPack4();
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockImplementation(() => {
			throw new Error("broken");
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(2);
		vi.setSystemTime(new Date("2030-01-01T08:00:00Z"));
		await vi.advanceTimersByTimeAsync(MIN);
		expect(api.fetchPack).toHaveBeenCalledTimes(3);
		sync.stop();
	});

	it("hands the stop signal to the manifest and slide requests", async () => {
		api.fetchManifest.mockResolvedValue(
			manifest(1, [slide("htm1", "html")])
		);
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		const manifestSignal = api.fetchManifest.mock.calls[0]?.[1];
		const slideSignal = api.fetchSlide.mock.calls[0]?.[2];
		expect(manifestSignal?.aborted).toBe(false);
		expect(slideSignal).toBe(manifestSignal);
		sync.stop();
		expect(manifestSignal?.aborted).toBe(true);
	});

	it("treats a timed-out manifest as a network error and polls again", async () => {
		api.fetchManifest
			.mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
			.mockResolvedValue(manifest(1, [slide("htm1", "html")]));
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		expect(player.setSlides).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(MIN);
		expect(player.setSlides).toHaveBeenCalledTimes(1);
		sync.stop();
	});

	it("hands the previous pack's images to the next load and revokes only the URLs the new pack dropped", async () => {
		const images = new Map([
			["slides/a.png", { key: "1:1", url: "blob:keep" }],
		]);
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:keep", "blob:drop"],
			images,
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [{ id: "p2" }],
			objectUrls: ["blob:keep", "blob:new"],
			images,
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(packMock.loadPack).toHaveBeenLastCalledWith(ZIP, images);
		expect(revokeUrl).toHaveBeenCalledWith("blob:drop");
		expect(revokeUrl).not.toHaveBeenCalledWith("blob:keep");
		sync.stop();
		expect(revokeUrl).toHaveBeenCalledWith("blob:keep");
	});

	it("does not revoke a reused URL when the new pack's setSlides throws: it still belongs to the old pack", async () => {
		const images = new Map([
			["slides/a.png", { key: "1:1", url: "blob:keep" }],
		]);
		api.fetchManifest.mockResolvedValueOnce(packManifest(1, 4));
		api.fetchPack.mockResolvedValue(download(4));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [{ id: "p1" }],
			objectUrls: ["blob:keep"],
			images,
		});
		const { sync } = start();
		await vi.advanceTimersByTimeAsync(0);
		api.fetchManifest.mockResolvedValue(packManifest(2, 5));
		api.fetchPack.mockResolvedValue(download(5));
		packMock.loadPack.mockReturnValueOnce({
			transition: "fade",
			slides: [{ id: "p2" }],
			objectUrls: ["blob:keep", "blob:new"],
			images,
		});
		player.setSlides.mockImplementationOnce(() => {
			throw new Error("boom");
		});
		await vi.advanceTimersByTimeAsync(MIN);
		expect(revokeUrl).toHaveBeenCalledWith("blob:new");
		expect(revokeUrl).not.toHaveBeenCalledWith("blob:keep");
		sync.stop();
	});
});
