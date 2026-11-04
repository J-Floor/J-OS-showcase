import { expect, test } from "vitest";

import { splitPhoneBar } from "./phoneBar.ts";

function pages(count: number): number[] {
	return Array.from({ length: count }, (_, index) => index + 1);
}

test("up to five pages all show, with nothing overflowing", () => {
	expect(splitPhoneBar(pages(4))).toEqual({ bar: pages(4), overflow: [] });
	expect(splitPhoneBar(pages(5))).toEqual({ bar: pages(5), overflow: [] });
});

test("six pages show four and overflow the fifth and sixth", () => {
	expect(splitPhoneBar(pages(6))).toEqual({
		bar: [1, 2, 3, 4],
		overflow: [5, 6],
	});
});

test("seven pages show four and overflow three", () => {
	expect(splitPhoneBar(pages(7))).toEqual({
		bar: [1, 2, 3, 4],
		overflow: [5, 6, 7],
	});
});
