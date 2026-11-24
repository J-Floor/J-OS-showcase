import { describe, expect, it } from "vitest";

import { TV_LIMITS, TV_PACK_LIMITS } from "./constants.ts";
import {
	isAssetPath,
	isPackPath,
	isSlidePath,
	packContentType,
	packFileMaxBytes,
	PACK_CONFIG_PATH,
} from "./packPaths.ts";

describe("pack paths", () => {
	it.each([
		"slides/opinions-1.png",
		"slides/event-abc.html",
		"slides/a.jpg",
		"slides/a.jpeg",
		"slides/a.webp",
		"slides/a.gif",
	])("accepts the slide file %s", (path) => {
		expect(isSlidePath(path)).toBe(true);
		expect(isPackPath(path)).toBe(true);
	});

	it.each([
		"assets/logo.png",
		"assets/fonts/manrope.woff2",
		"assets/a/b/c/d.ttf",
		"assets/Brand_Logo-2.webp",
	])("accepts the asset %s", (path) => {
		expect(isAssetPath(path)).toBe(true);
	});

	it.each([
		"../config.xml",
		"slides/../x.png",
		"assets/../slides/a.png",
		"assets/.hidden.png",
		"/slides/a.png",
		"slides\\a.png",
		"slides/A.png",
		"slides/a.svg",
		"assets/a.svg",
		"assets/a.js",
		"assets/a.html",
		"assets/a.css",
		"slides/sub/a.png",
		"assets/a/b/c/d/e.png",
		"other/a.png",
		"slides/a.PNG",
		"slides/a.png\n",
		"assets/a.png\n",
		"slides/a\0.png",
		"assets/a\0.png",
		"slides//a.png",
		"assets//a.png",
		"assets/a//b.png",
		"Slides/a.png",
		"Assets/a.png",
	])("refuses %s", (path) => {
		expect(isPackPath(path)).toBe(false);
	});

	it("maps extensions to content types", () => {
		expect(packContentType("slides/a.html")).toBe("text/html");
		expect(packContentType("slides/a.jpg")).toBe("image/jpeg");
		expect(packContentType("assets/f.woff2")).toBe("font/woff2");
	});

	it("caps each file by kind", () => {
		expect(packFileMaxBytes(PACK_CONFIG_PATH)).toBe(
			TV_PACK_LIMITS.configMaxBytes
		);
		expect(packFileMaxBytes("slides/a.html")).toBe(TV_LIMITS.htmlMax);
		expect(packFileMaxBytes("assets/a.png")).toBe(TV_LIMITS.imageMaxBytes);
		// Intended: a font may be as large as an image (8 MiB).
		expect(packFileMaxBytes("assets/f.woff2")).toBe(
			TV_LIMITS.imageMaxBytes
		);
	});
});
