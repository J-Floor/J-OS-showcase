// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { ImageCursorZone } from "./ImageCursorZone.tsx";

describe("ImageCursorZone", () => {
	it("renders its children", () => {
		render(() => (
			<ImageCursorZone label="The space">
				<img alt="a photo" src="/photo.webp" />
			</ImageCursorZone>
		));
		expect(screen.getByAltText("a photo")).toBeInTheDocument();
	});
});
