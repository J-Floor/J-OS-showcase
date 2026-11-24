import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	fetchManifest,
	fetchPack,
	fetchSlide,
	pollPairing,
	startPairing,
} from "./api.ts";

const fetchMock = vi.fn<typeof fetch>();
const BASE = "https://api.example.com";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.useRealTimers();
	fetchMock.mockReset();
	vi.unstubAllGlobals();
});

describe("api", () => {
	it("starts a pairing with a POST to the base URL", async () => {
		const body = { code: "abcd", pollSecret: "s", expiresAt: 5 };
		fetchMock.mockResolvedValue(jsonResponse(body));
		expect(await startPairing()).toEqual(body);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/pair/start`);
		expect(init?.method).toBe("POST");
	});

	it("posts the poll secret as the poll body", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ status: "pending" }));
		await pollPairing("secret-1");
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/pair/poll`);
		expect(JSON.parse(init?.body as string)).toEqual({
			pollSecret: "secret-1",
		});
	});

	it("reads expired and unknown pollings from their error statuses", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ status: "expired" }, 410)
		);
		expect(await pollPairing("a")).toEqual({ status: "expired" });
		fetchMock.mockResolvedValueOnce(
			jsonResponse({ status: "unknown" }, 404)
		);
		expect(await pollPairing("a")).toEqual({ status: "unknown" });
	});

	it("throws on a rate-limited poll", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ error: "rate-limited" }, 429)
		);
		await expect(pollPairing("a")).rejects.toThrow();
	});

	it("sends the Bearer header with the manifest request", async () => {
		const manifest = { version: 1, transition: "fade", slides: [] };
		fetchMock.mockResolvedValue(jsonResponse(manifest));
		expect(await fetchManifest("tok-1")).toEqual(manifest);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/manifest`);
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer tok-1"
		);
	});

	it("sends the Bearer header with the slide request and returns the blob", async () => {
		fetchMock.mockResolvedValue(new Response("<p>hi</p>"));
		const blob = await fetchSlide("tok-2", "/tv/slide?id=abc");
		expect(blob).toBeInstanceOf(Blob);
		expect(await (blob as Blob).text()).toBe("<p>hi</p>");
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/slide?id=abc`);
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer tok-2"
		);
	});

	it("maps 401 to unauthorized for the manifest and slides", async () => {
		fetchMock.mockImplementation(() =>
			Promise.resolve(new Response(null, { status: 401 }))
		);
		expect(await fetchManifest("x")).toBe("unauthorized");
		expect(await fetchSlide("x", "/tv/slide?id=a")).toBe("unauthorized");
	});

	it("throws on other failures so callers keep the last good slides", async () => {
		fetchMock.mockImplementation(() =>
			Promise.resolve(new Response(null, { status: 429 }))
		);
		await expect(fetchManifest("x")).rejects.toThrow();
		await expect(fetchSlide("x", "/tv/slide?id=a")).rejects.toThrow();
	});

	it("maps a 404 slide to missing", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		expect(await fetchSlide("x", "/tv/slide?id=a")).toBe("missing");
	});

	it.each([
		"@evil.example/x",
		"//evil.example/x",
		"https://evil.example/tv/slide?id=1",
		"/other?id=1",
	])(
		"never sends the token for the foreign or non-slide source %s",
		async (source) => {
			expect(await fetchSlide("tok", source)).toBe("missing");
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it("accepts an absolute slide URL on the API origin", async () => {
		fetchMock.mockResolvedValue(new Response("ok"));
		await fetchSlide("tok", `${BASE}/tv/slide?id=1`);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/tv/slide?id=1`);
	});

	it("downloads the pack with the Bearer header and reads its version from the response header", async () => {
		fetchMock.mockResolvedValue(
			new Response(new Uint8Array([80, 75]), {
				status: 200,
				headers: { "X-Tv-Pack-Version": "7" },
			})
		);
		expect(await fetchPack("tok-1")).toEqual({
			zip: new Uint8Array([80, 75]),
			version: 7,
		});
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/pack`);
		expect(new Headers(init?.headers).get("Authorization")).toBe(
			"Bearer tok-1"
		);
	});

	it("aborts the download when the caller's signal aborts", async () => {
		vi.useFakeTimers();
		const sent = stallingFetch();
		const controller = new AbortController();
		const result = fetchPack("t", controller.signal);
		const failure = expect(result).rejects.toThrow();
		controller.abort();
		await failure;
		expect(sent.signal?.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("reports no version when the header is missing or not a number", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(new Uint8Array([1]), { status: 200 })
		);
		expect(await fetchPack("t")).toEqual({
			zip: new Uint8Array([1]),
			version: undefined,
		});
		fetchMock.mockResolvedValueOnce(
			new Response(new Uint8Array([1]), {
				status: 200,
				headers: { "X-Tv-Pack-Version": "abc" },
			})
		);
		expect(await fetchPack("t")).toEqual({
			zip: new Uint8Array([1]),
			version: undefined,
		});
	});

	it("maps pack 401 and 404, and throws on 429", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
		expect(await fetchPack("t")).toBe("unauthorized");
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
		expect(await fetchPack("t")).toBe("missing");
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
		await expect(fetchPack("t")).rejects.toThrow();
	});
});

/** A fetch that never answers until its signal aborts, like a half-open connection. */
function stallingFetch(): { signal: AbortSignal | undefined } {
	const sent: { signal: AbortSignal | undefined } = { signal: undefined };
	fetchMock.mockImplementation(
		(_url, init) =>
			new Promise((_resolve, reject) => {
				sent.signal = init?.signal ?? undefined;
				init?.signal?.addEventListener("abort", () => {
					reject(new DOMException("aborted", "AbortError"));
				});
			})
	);
	return sent;
}

describe("api timeouts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("gives up on a stalled manifest, slide, pairing start and poll after 30 seconds", async () => {
		const calls = [
			() => fetchManifest("t"),
			() => fetchSlide("t", "/tv/slide?id=a"),
			() => startPairing(),
			() => pollPairing("s"),
		];
		for (const call of calls) {
			stallingFetch();
			const failure = expect(call()).rejects.toThrow();
			await vi.advanceTimersByTimeAsync(29_999);
			expect(vi.getTimerCount()).toBe(1);
			await vi.advanceTimersByTimeAsync(1);
			await failure;
			expect(vi.getTimerCount()).toBe(0);
		}
	});

	it("gives a pack download minutes, not 30 seconds", async () => {
		stallingFetch();
		const failure = expect(fetchPack("t")).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(270_000);
		await failure;
		expect(vi.getTimerCount()).toBe(0);
	});

	it("also times out a body that stalls after the headers arrived", async () => {
		fetchMock.mockImplementation((_url, init) =>
			Promise.resolve({
				ok: true,
				status: 200,
				headers: new Headers(),
				blob: () =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(new DOMException("aborted", "AbortError"));
						});
					}),
			} as unknown as Response)
		);
		const failure = expect(
			fetchSlide("t", "/tv/slide?id=a")
		).rejects.toThrow();
		await vi.advanceTimersByTimeAsync(30_000);
		await failure;
		expect(vi.getTimerCount()).toBe(0);
	});

	it("aborts a manifest or slide request when the caller's signal aborts, and clears the timer on success", async () => {
		const sent = stallingFetch();
		const controller = new AbortController();
		const failure = expect(
			fetchManifest("t", controller.signal)
		).rejects.toThrow();
		controller.abort();
		await failure;
		expect(sent.signal?.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(new Response("<p/>"));
		await fetchSlide("t", "/tv/slide?id=a", controller.signal).catch(
			() => {}
		);
		fetchMock.mockResolvedValue(jsonResponse({ version: 1 }));
		await fetchManifest("t");
		expect(vi.getTimerCount()).toBe(0);
	});
});
