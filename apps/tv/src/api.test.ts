import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchManifest, fetchSlide, pollPairing, startPairing } from "./api.ts";

const fetchMock = vi.fn<typeof fetch>();
const BASE = "https://api.example.com";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
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
		expect(JSON.parse(init?.body as string)).toEqual({ pollSecret: "secret-1" });
	});

	it("reads expired and unknown pollings from their error statuses", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ status: "expired" }, 410));
		expect(await pollPairing("a")).toEqual({ status: "expired" });
		fetchMock.mockResolvedValueOnce(jsonResponse({ status: "unknown" }, 404));
		expect(await pollPairing("a")).toEqual({ status: "unknown" });
	});

	it("throws on a rate-limited poll", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ error: "rate-limited" }, 429));
		await expect(pollPairing("a")).rejects.toThrow();
	});

	it("sends the Bearer header with the manifest request", async () => {
		const manifest = { version: 1, transition: "fade", slides: [] };
		fetchMock.mockResolvedValue(jsonResponse(manifest));
		expect(await fetchManifest("tok-1")).toEqual(manifest);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/manifest`);
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok-1");
	});

	it("sends the Bearer header with the slide request and returns the blob", async () => {
		fetchMock.mockResolvedValue(new Response("<p>hi</p>"));
		const blob = await fetchSlide("tok-2", "/tv/slide?id=abc");
		expect(blob).toBeInstanceOf(Blob);
		expect(await (blob as Blob).text()).toBe("<p>hi</p>");
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe(`${BASE}/tv/slide?id=abc`);
		expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok-2");
	});

	it("maps 401 to unauthorized for the manifest and slides", async () => {
		fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 401 })));
		expect(await fetchManifest("x")).toBe("unauthorized");
		expect(await fetchSlide("x", "/tv/slide?id=a")).toBe("unauthorized");
	});

	it("throws on other failures so callers keep the last good slides", async () => {
		fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 429 })));
		await expect(fetchManifest("x")).rejects.toThrow();
		await expect(fetchSlide("x", "/tv/slide?id=a")).rejects.toThrow();
	});

	it("maps a 404 slide to missing", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		expect(await fetchSlide("x", "/tv/slide?id=a")).toBe("missing");
	});

	it.each(["@evil.example/x", "//evil.example/x", "https://evil.example/tv/slide?id=1", "/other?id=1"])(
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
});
