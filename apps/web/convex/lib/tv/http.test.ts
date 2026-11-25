import { describe, expect, it, vi } from "vitest";

import { TV_CORS_HEADERS } from "./constants.ts";
import {
	type DeviceDeps,
	manifestResponse,
	packResponse,
	scheduleResponse,
	slideResponse,
	TV_SLIDE_CSP,
} from "./http.ts";
import { hashTvSecret } from "./tokens.ts";

const MANIFEST = {
	version: 3,
	transition: "fade" as const,
	packVersion: null,
	slides: [],
};

function makeDeps(overrides: Partial<DeviceDeps> = {}): DeviceDeps {
	return {
		authenticate: vi.fn(() => Promise.resolve(true)),
		limit: vi.fn(() => Promise.resolve(true)),
		manifest: vi.fn(() => Promise.resolve(MANIFEST)),
		content: vi.fn(() => Promise.resolve(null)),
		pack: vi.fn(() => Promise.resolve(null)),
		schedule: vi.fn(() => Promise.resolve(null)),
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
		expect(await response.json()).toEqual({
			...MANIFEST,
			scheduleVersion: null,
		});
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

describe("packResponse", () => {
	it("answers 401 without a token, exactly like the manifest", async () => {
		const deps = makeDeps();
		const pack = await snapshot(
			await packResponse(request("/tv/pack"), deps)
		);
		const manifest = await snapshot(
			await manifestResponse(request("/tv/manifest"), deps)
		);
		expect(pack).toEqual(manifest);
		expect(deps.pack).not.toHaveBeenCalled();
	});

	it("answers 404 before the first pack is built", async () => {
		const response = await packResponse(
			request("/tv/pack", "Bearer abc"),
			makeDeps()
		);
		expect(response.status).toBe(404);
	});

	it("streams the zip, private and not sniffable", async () => {
		const zip = new Blob([new Uint8Array([80, 75, 3, 4])], {
			type: "application/zip",
		});
		const deps = makeDeps({
			pack: vi.fn(() => Promise.resolve({ fileId: "f1", version: 6 })),
			getBlob: vi.fn(() => Promise.resolve(zip)),
		});
		const response = await packResponse(
			request("/tv/pack", "Bearer abc"),
			deps
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/zip");
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([80, 75, 3, 4])
		);
		expect(deps.getBlob).toHaveBeenCalledWith("f1");
	});

	it("names the version of the file it serves and exposes the header to scripts", async () => {
		const zip = new Blob(["z"]);
		for (const version of [6, 7]) {
			const response = await packResponse(
				request("/tv/pack", "Bearer abc"),
				makeDeps({
					pack: vi.fn(() =>
						Promise.resolve({ fileId: "f1", version })
					),
					getBlob: vi.fn(() => Promise.resolve(zip)),
				})
			);
			expect(response.headers.get("X-Tv-Pack-Version")).toBe(
				String(version)
			);
			expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
				"X-Tv-Pack-Version"
			);
		}
	});

	it("answers a bare 404 when the file is gone from storage", async () => {
		const response = await packResponse(
			request("/tv/pack", "Bearer abc"),
			makeDeps({
				pack: vi.fn(() =>
					Promise.resolve({ fileId: "f1", version: 6 })
				),
				getBlob: vi.fn(() => Promise.resolve(null)),
			})
		);
		expect(response.status).toBe(404);
		expect(await response.text()).toBe("");
		expect(response.headers.get("X-Tv-Pack-Version")).toBeNull();
		expect(response.headers.get("Content-Type")).toBeNull();
	});

	it("is rate limited like every device route", async () => {
		const deps = makeDeps({ limit: vi.fn(() => Promise.resolve(false)) });
		const response = await packResponse(
			request("/tv/pack", "Bearer abc"),
			deps
		);
		expect(response.status).toBe(429);
		expect(deps.pack).not.toHaveBeenCalled();
	});
});

describe("manifest scheduleVersion", () => {
	const auth = "Bearer abc";

	it("is null without a schedule", async () => {
		const response = await manifestResponse(
			request("/tv/manifest", auth),
			makeDeps()
		);
		expect(await response.json()).toEqual({
			...MANIFEST,
			scheduleVersion: null,
		});
	});

	it("carries the schedule's version", async () => {
		const deps = makeDeps({
			schedule: () => Promise.resolve({ version: 7, days: [] }),
		});
		const response = await manifestResponse(
			request("/tv/manifest", auth),
			deps
		);
		expect(await response.json()).toEqual({
			...MANIFEST,
			scheduleVersion: 7,
		});
	});
});

describe("scheduleResponse", () => {
	const auth = "Bearer abc";
	const xml = '<schedule version="7"><day name="mon" off="all"/></schedule>';

	it("is 401 without a token", async () => {
		const deps = makeDeps();
		const response = await scheduleResponse(request("/tv/schedule"), deps);
		expect(response.status).toBe(401);
		expect(deps.schedule).not.toHaveBeenCalled();
	});

	it("is 404 when the device has no schedule", async () => {
		const response = await scheduleResponse(
			request("/tv/schedule", auth),
			makeDeps()
		);
		expect(response.status).toBe(404);
	});

	it("serves the XML with its version", async () => {
		const schedule = vi.fn(() =>
			Promise.resolve({
				version: 7,
				days: [{ day: "mon" as const, closed: true }],
			})
		);
		const deps = makeDeps({ schedule });
		const response = await scheduleResponse(
			request("/tv/schedule", auth),
			deps
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/xml; charset=utf-8"
		);
		expect(response.headers.get("X-Tv-Schedule-Version")).toBe("7");
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect(await response.text()).toBe(xml);
		expect(schedule).toHaveBeenCalledWith(await hashTvSecret("abc"));
	});

	it("is 429 when the device is over its limit", async () => {
		const deps = makeDeps({ limit: () => Promise.resolve(false) });
		const response = await scheduleResponse(
			request("/tv/schedule", auth),
			deps
		);
		expect(response.status).toBe(429);
		expect(deps.schedule).not.toHaveBeenCalled();
	});
});
