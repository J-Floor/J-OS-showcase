import { describe, expect, it, vi } from "vitest";

import { TV_CORS_HEADERS } from "./constants.ts";
import {
	type DeviceDeps,
	manifestResponse,
	slideResponse,
	TV_SLIDE_CSP,
} from "./http.ts";
import { hashTvSecret } from "./tokens.ts";

const MANIFEST = {
	version: 3,
	transition: "fade" as const,
	slides: [],
};

function makeDeps(overrides: Partial<DeviceDeps> = {}): DeviceDeps {
	return {
		authenticate: vi.fn(() => Promise.resolve(true)),
		limit: vi.fn(() => Promise.resolve(true)),
		manifest: vi.fn(() => Promise.resolve(MANIFEST)),
		content: vi.fn(() => Promise.resolve(null)),
		getBlob: vi.fn(() => Promise.resolve(null)),
		...overrides,
	};
}

function request(path: string, authorization?: string) {
	return new Request(`https://example.com${path}`, {
		headers:
			authorization === undefined ? {} : { Authorization: authorization },
	});
}

async function snapshot(response: Response) {
	return {
		status: response.status,
		headers: [...response.headers.entries()].toSorted(([left], [right]) =>
			left.localeCompare(right)
		),
		body: await response.text(),
	};
}

describe("manifestResponse", () => {
	it("rejects a missing header with 401 and no body", async () => {
		const deps = makeDeps();
		const response = await manifestResponse(request("/tv/manifest"), deps);
		expect(response.status).toBe(401);
		expect(await response.text()).toBe("");
		expect(deps.authenticate).not.toHaveBeenCalled();
	});

	it("rejects the wrong scheme", async () => {
		const deps = makeDeps();
		const response = await manifestResponse(
			request("/tv/manifest", "Basic abc"),
			deps
		);
		expect(response.status).toBe(401);
		expect(deps.authenticate).not.toHaveBeenCalled();
		expect(deps.manifest).not.toHaveBeenCalled();
	});

	it("answers an unknown or revoked token exactly like a missing one", async () => {
		const missing = await snapshot(
			await manifestResponse(request("/tv/manifest"), makeDeps())
		);
		const deps = makeDeps({ authenticate: () => Promise.resolve(false) });
		const rejected = await snapshot(
			await manifestResponse(request("/tv/manifest", "Bearer abc"), deps)
		);
		expect(rejected).toEqual(missing);
		expect(rejected.status).toBe(401);
		expect(deps.manifest).not.toHaveBeenCalled();
	});

	it("authenticates with the hash, never the raw token", async () => {
		const deps = makeDeps();
		await manifestResponse(request("/tv/manifest", "Bearer abc"), deps);
		expect(deps.authenticate).toHaveBeenCalledWith(
			await hashTvSecret("abc")
		);
	});

	it("returns the manifest as JSON with CORS for a valid token", async () => {
		const response = await manifestResponse(
			request("/tv/manifest", "Bearer abc"),
			makeDeps()
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(MANIFEST);
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			TV_CORS_HEADERS["Access-Control-Allow-Origin"]
		);
	});

	it("answers 429 when the device is over its limit", async () => {
		const deps = makeDeps({ limit: () => Promise.resolve(false) });
		const response = await manifestResponse(
			request("/tv/manifest", "Bearer abc"),
			deps
		);
		expect(response.status).toBe(429);
		expect(deps.manifest).not.toHaveBeenCalled();
	});
});

describe("slideResponse", () => {
	const auth = "Bearer abc";

	it("rejects an unauthenticated request before reading content", async () => {
		const deps = makeDeps({ authenticate: () => Promise.resolve(false) });
		const response = await slideResponse(
			request("/tv/slide?id=x", auth),
			deps
		);
		expect(response.status).toBe(401);
		expect(deps.content).not.toHaveBeenCalled();
	});

	it("serves html with the sandbox CSP and nosniff", async () => {
		const deps = makeDeps({
			content: () =>
				Promise.resolve({
					kind: "html" as const,
					htmlText: "<p>hi</p>",
				}),
		});
		const response = await slideResponse(
			request("/tv/slide?id=x", auth),
			deps
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8"
		);
		expect(response.headers.get("Content-Security-Policy")).toBe(
			"sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'"
		);
		expect(TV_SLIDE_CSP).toBe(
			response.headers.get("Content-Security-Policy")
		);
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.text()).toBe("<p>hi</p>");
	});

	it("serves an image with its stored type and nosniff", async () => {
		const blob = new Blob(["png"], { type: "image/png" });
		const getBlob = vi.fn(() => Promise.resolve(blob));
		const deps = makeDeps({
			content: () =>
				Promise.resolve({ kind: "image" as const, fileId: "file1" }),
			getBlob,
		});
		const response = await slideResponse(
			request("/tv/slide?id=x", auth),
			deps
		);
		expect(response.status).toBe(200);
		expect(getBlob).toHaveBeenCalledWith("file1");
		expect(response.headers.get("Content-Type")).toBe("image/png");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(await response.text()).toBe("png");
	});

	it("answers 404 for an unknown id, a missing id and a missing blob", async () => {
		const unknown = await slideResponse(
			request("/tv/slide?id=nope", auth),
			makeDeps()
		);
		expect(unknown.status).toBe(404);
		const noId = await slideResponse(
			request("/tv/slide", auth),
			makeDeps()
		);
		expect(noId.status).toBe(404);
		const lostBlob = await slideResponse(
			request("/tv/slide?id=x", auth),
			makeDeps({
				content: () =>
					Promise.resolve({ kind: "image" as const, fileId: "gone" }),
			})
		);
		expect(lostBlob.status).toBe(404);
	});

	it("answers 429 when rate limited", async () => {
		const deps = makeDeps({ limit: () => Promise.resolve(false) });
		const response = await slideResponse(
			request("/tv/slide?id=x", auth),
			deps
		);
		expect(response.status).toBe(429);
		expect(deps.content).not.toHaveBeenCalled();
	});
});
