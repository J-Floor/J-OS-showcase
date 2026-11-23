// @vitest-environment happy-dom
import { expect, test } from "vitest";

import { TV_LIMITS } from "../../../../convex/lib/tv/constants.ts";

import { readSlideFile } from "./readSlideFile.ts";

function bytes(count: number): Uint8Array<ArrayBuffer> {
	return new Uint8Array(count);
}

test("an .html file by name is read as HTML text", async () => {
	const result = await readSlideFile(
		new File(["<h1>Hi</h1>"], "page.html", { type: "" })
	);
	expect(result).toEqual({ kind: "html", htmlText: "<h1>Hi</h1>" });
});

test("a text/html file is read as HTML whatever its name", async () => {
	const result = await readSlideFile(
		new File(["<p>x</p>"], "notes", { type: "text/html" })
	);
	expect(result).toEqual({ kind: "html", htmlText: "<p>x</p>" });
});

test("each allowed image type comes back as the file itself", async () => {
	for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
		const file = new File([bytes(4)], "picture", { type });
		expect(await readSlideFile(file)).toEqual({ kind: "image", file });
	}
});

test("an image at the size limit is accepted, one byte over is refused", async () => {
	const atLimit = new File([bytes(TV_LIMITS.imageMaxBytes)], "a.png", {
		type: "image/png",
	});
	const atLimitResult = await readSlideFile(atLimit);
	expect(atLimitResult.kind).toBe("image");
	const over = new File([bytes(TV_LIMITS.imageMaxBytes + 1)], "b.png", {
		type: "image/png",
	});
	const overResult = await readSlideFile(over);
	expect(overResult.kind).toBe("error");
});

test("SVG is refused (it can carry script)", async () => {
	const result = await readSlideFile(
		new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })
	);
	expect(result.kind).toBe("error");
});

test("any other type is refused", async () => {
	const result = await readSlideFile(
		new File(["%PDF"], "doc.pdf", { type: "application/pdf" })
	);
	expect(result.kind).toBe("error");
});

test("HTML over the length limit is refused", async () => {
	const result = await readSlideFile(
		new File(["a".repeat(TV_LIMITS.htmlMax + 1)], "big.html", {
			type: "text/html",
		})
	);
	expect(result.kind).toBe("error");
});

test("HTML is measured in bytes: multibyte text under the character cap but over the byte cap is refused", async () => {
	const body = "é".repeat(TV_LIMITS.htmlMax / 2 + 1);
	expect(body.length).toBeLessThan(TV_LIMITS.htmlMax);
	const result = await readSlideFile(
		new File([body], "wide.html", { type: "text/html" })
	);
	expect(result.kind).toBe("error");
});

test("HTML at the length limit is accepted", async () => {
	const result = await readSlideFile(
		new File(["a".repeat(TV_LIMITS.htmlMax)], "ok.html", {
			type: "text/html",
		})
	);
	expect(result.kind).toBe("html");
});
