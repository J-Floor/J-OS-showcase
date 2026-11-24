import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadPack } from "./pack.ts";

const PNG = new Uint8Array([137, 80, 78, 71]);
const createUrl = vi.fn<(blob: Blob) => string>();

beforeEach(() => {
	let count = 0;
	createUrl.mockImplementation(() => `blob:fake-${String(++count)}`);
	vi.stubGlobal(
		"URL",
		Object.assign(URL, {
			createObjectURL: createUrl,
			revokeObjectURL: vi.fn(),
		})
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

function pack(
	config: string,
	extra: Record<string, Uint8Array> = {}
): Uint8Array {
	return zipSync({ "config.xml": strToU8(config), ...extra });
}

const CONFIG = `<?xml version="1.0" encoding="UTF-8"?>
<tv version="1" transition="slide">
  <slide id="a" type="image" src="slides/a.png" duration="12" enabled="true"/>
  <slide id="off" type="image" src="slides/a.png" duration="12" enabled="false"/>
  <slide id="b" type="html" src="slides/b.html" duration="20" enabled="true"/>
  <slide id="gone" type="image" src="slides/gone.png" duration="20" enabled="true"/>
</tv>
`;

function one(attributes: string): ReturnType<typeof loadPack> {
	const config = `<tv version="1"><slide id="a" type="image" src="slides/a.png" ${attributes}/><slide id="ok" type="image" src="slides/a.png" duration="9" enabled="true"/></tv>`;
	return loadPack(pack(config, { "slides/a.png": PNG }));
}

describe("loadPack", () => {
	it("builds player slides: images as blob: URLs, HTML assets as data: URIs", () => {
		const loaded = loadPack(
			pack(CONFIG, {
				"slides/a.png": PNG,
				"slides/b.html": strToU8(
					'<img src="assets/logo.png"><p>Hi</p>'
				),
				"assets/logo.png": PNG,
			})
		);
		expect(loaded.transition).toBe("slide");
		expect(loaded.slides).toEqual([
			{
				id: "a",
				kind: "image",
				durationSec: 12,
				imageUrl: "blob:fake-1",
			},
			{
				id: "b",
				kind: "html",
				durationSec: 20,
				html: '<img src="data:image/png;base64,iVBORw=="><p>Hi</p>',
			},
		]);
		expect(loaded.objectUrls).toEqual(["blob:fake-1"]);
		expect(createUrl.mock.calls[0]?.[0].type).toBe("image/png");
	});

	it("throws on a pack without config.xml or with a broken one", () => {
		expect(() => loadPack(zipSync({ "slides/a.png": PNG }))).toThrow();
		expect(() => loadPack(pack("<tv"))).toThrow();
		expect(() => loadPack(pack("<show/>"))).toThrow();
	});

	it("refuses an entry over the size cap and revokes nothing it did not create", () => {
		const big = new Uint8Array(8 * 1024 * 1024 + 1);
		const config =
			'<tv version="1" transition="fade"><slide id="a" type="image" src="slides/a.png" duration="5" enabled="true"/></tv>';
		expect(() => loadPack(pack(config, { "slides/a.png": big }))).toThrow(
			/too large/
		);
		expect(createUrl).not.toHaveBeenCalled();
	});

	it("revokes the blob URLs it made when a later slide breaks the pack", () => {
		const revoke = vi.fn<(url: string) => void>();
		vi.stubGlobal(
			"URL",
			Object.assign(URL, {
				createObjectURL: createUrl,
				revokeObjectURL: revoke,
			})
		);
		const big = new Uint8Array(8 * 1024 * 1024 + 1);
		const config =
			'<tv version="1"><slide id="a" type="image" src="slides/a.png" duration="5" enabled="true"/><slide id="b" type="image" src="slides/b.png" duration="5" enabled="true"/></tv>';
		expect(() =>
			loadPack(pack(config, { "slides/a.png": PNG, "slides/b.png": big }))
		).toThrow();
		expect(revoke).toHaveBeenCalledWith("blob:fake-1");
	});

	describe("slide validation", () => {
		it.each([
			"NaN",
			"abc",
			"",
			"0",
			"4",
			"-10",
			"301",
			"1e9",
			"7.5",
			"Infinity",
		])(
			"skips a slide with duration %j and keeps the others",
			(duration) => {
				const loaded = one(`duration="${duration}"`);
				expect(loaded.slides.map((slide) => slide.id)).toEqual(["ok"]);
			}
		);

		it("accepts the limits and the default", () => {
			expect(one('duration="5"').slides[0]?.durationSec).toBe(5);
			expect(one('duration="300"').slides[0]?.durationSec).toBe(300);
			expect(one("").slides[0]?.durationSec).toBe(15);
		});

		it("plays nothing (idle screen) when every slide is invalid", () => {
			const config =
				'<tv version="1"><slide id="a" type="image" src="slides/a.png" duration="0"/></tv>';
			expect(
				loadPack(pack(config, { "slides/a.png": PNG })).slides
			).toEqual([]);
		});

		it.each([
			"../a.png",
			"/slides/a.png",
			"slides/A.png",
			"slides/x/a.png",
			"assets/a.png",
			"slides/a.svg",
		])("skips a slide with src %j without reading it", (source) => {
			const config = `<tv version="1"><slide id="a" type="image" src="${source}" duration="9"/></tv>`;
			const loaded = loadPack(
				pack(config, { [source.replace(/^\//, "")]: PNG })
			);
			expect(loaded.slides).toEqual([]);
			expect(createUrl).not.toHaveBeenCalled();
		});

		it("skips a slide whose type is neither image nor html", () => {
			const config =
				'<tv version="1"><slide id="a" type="video" src="slides/a.png" duration="9"/></tv>';
			expect(
				loadPack(pack(config, { "slides/a.png": PNG })).slides
			).toEqual([]);
		});
	});

	it("encodes a multi-chunk asset exactly like btoa and reuses one data: URI across slides", () => {
		const asset = new Uint8Array(100_003).map((_, index) => index % 251);
		const expected = Buffer.from(asset).toString("base64");
		const config =
			'<tv version="1"><slide id="a" type="html" src="slides/a.html" duration="9"/><slide id="b" type="html" src="slides/b.html" duration="9"/></tv>';
		const loaded = loadPack(
			pack(config, {
				"slides/a.html": strToU8('<img src="assets/big.png">'),
				"slides/b.html": strToU8('<img src="assets/big.png?v=1">'),
				"assets/big.png": asset,
			})
		);
		const html = `<img src="data:image/png;base64,${expected}">`;
		expect(loaded.slides.map((slide) => slide.html)).toEqual([html, html]);
	});

	it("inflates a shared asset once however many slides use it", () => {
		const asset = new Uint8Array(5 * 1024 * 1024);
		const slides = Array.from(
			{ length: 13 },
			(_, index) =>
				`<slide id="s${String(index)}" type="html" src="slides/s${String(index)}.html" duration="9"/>`
		).join("");
		const files: Record<string, Uint8Array> = { "assets/big.png": asset };
		for (let index = 0; index < 13; index += 1)
			files[`slides/s${String(index)}.html`] = strToU8(
				'<img src="assets/big.png">'
			);
		const loaded = loadPack(pack(`<tv version="1">${slides}</tv>`, files));
		expect(loaded.slides).toHaveLength(13);
	});

	it("types an asset by its own extension only, in any case", () => {
		const config =
			'<tv version="1"><slide id="a" type="html" src="slides/a.html" duration="9"/></tv>';
		const loaded = loadPack(
			pack(config, {
				"slides/a.html": strToU8(
					'<img src="assets/LOGO.PNG"><img src="assets/x.constructor"><img src="assets/x.__proto__"><img src="assets/x.toString">'
				),
				"assets/LOGO.PNG": PNG,
				"assets/x.constructor": PNG,
				"assets/x.__proto__": PNG,
				"assets/x.toString": PNG,
			})
		);
		const html = loaded.slides[0]?.html ?? "";
		expect(html).toContain('src="data:image/png;base64,');
		expect(
			html.match(/data:application\/octet-stream;base64,/g)
		).toHaveLength(3);
	});

	it("rejects a pack whose HTML slides together are too large, though each asset is inflated once", () => {
		const asset = new Uint8Array(5 * 1024 * 1024);
		const count = 15;
		const files: Record<string, Uint8Array> = { "assets/big.png": asset };
		let slides = "";
		for (let index = 0; index < count; index += 1) {
			slides += `<slide id="s${String(index)}" type="html" src="slides/s${String(index)}.html" duration="9"/>`;
			files[`slides/s${String(index)}.html`] = strToU8(
				'<img src="assets/big.png">'
			);
		}
		expect(() =>
			loadPack(pack(`<tv version="1">${slides}</tv>`, files))
		).toThrow(/too large/);
	});

	describe("reusing image blob URLs", () => {
		const IMG =
			'<tv version="1"><slide id="a" type="image" src="slides/a.png" duration="9"/><slide id="b" type="image" src="slides/b.png" duration="9"/></tv>';
		const OTHER = new Uint8Array([1, 2, 3, 4]);

		it("keeps the URL of an image whose path and bytes are unchanged and makes one for a changed image", () => {
			const first = loadPack(
				pack(IMG, { "slides/a.png": PNG, "slides/b.png": PNG })
			);
			const second = loadPack(
				pack(IMG, { "slides/a.png": PNG, "slides/b.png": OTHER }),
				first.images
			);
			expect(second.slides[0]).toEqual(first.slides[0]);
			expect(second.slides[1]).not.toEqual(first.slides[1]);
			expect(createUrl).toHaveBeenCalledTimes(3);
			expect(second.objectUrls).toContain(first.slides[0]?.imageUrl);
		});

		it("does not revoke a reused URL when the load fails", () => {
			const revoke = vi.fn();
			vi.stubGlobal(
				"URL",
				Object.assign(URL, {
					createObjectURL: createUrl,
					revokeObjectURL: revoke,
				})
			);
			const first = loadPack(
				pack(IMG, { "slides/a.png": PNG, "slides/b.png": PNG })
			);
			const big = new Uint8Array(8 * 1024 * 1024 + 1);
			expect(() =>
				loadPack(
					pack(IMG, { "slides/a.png": PNG, "slides/b.png": big }),
					first.images
				)
			).toThrow();
			expect(revoke).not.toHaveBeenCalledWith(first.slides[0]?.imageUrl);
		});
	});
});
