import { expect, test } from "vitest";

import { tvMessages } from "../../convex/lib/errors/tv.ts";
import { TV_IMAGE_NAMES, TV_LIMITS } from "../../convex/lib/tv/constants.ts";

import { tvImageProblem } from "./tvImageProblem.ts";

test("a png within the limit has no problem", () => {
	expect(tvImageProblem({ type: "image/png", size: 10 })).toBeNull();
});

test("a file that is not an image type names the accepted types", () => {
	expect(tvImageProblem({ type: "text/plain", size: 10 })).toBe(
		`Choose a ${TV_IMAGE_NAMES} image.`
	);
});

test("a png exactly at the byte limit has no problem", () => {
	expect(
		tvImageProblem({ type: "image/png", size: TV_LIMITS.imageMaxBytes })
	).toBeNull();
});

test("a png over the byte limit is refused as invalid", () => {
	expect(
		tvImageProblem({
			type: "image/png",
			size: TV_LIMITS.imageMaxBytes + 1,
		})
	).toBe(tvMessages.TvImageInvalid);
});
