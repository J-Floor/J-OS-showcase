// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { PoweredBy } from "./PoweredBy.tsx";

describe("PoweredBy", () => {
	it("renders the heading and the partner logos", async () => {
		render(() => <PoweredBy />);
		expect(
			await screen.findByRole("heading", { name: /powered by/iu })
		).toBeTruthy();
		expect(screen.getByAltText(/swisscom/iu)).toBeTruthy();
		expect(screen.getByAltText(/founderful/iu)).toBeTruthy();
		expect(screen.getByAltText(/project a/iu)).toBeTruthy();
	});

	it("renders the logo set twice for a seamless marquee loop", () => {
		render(() => <PoweredBy />);
		// The visible copy names every partner; the duplicate copy used to
		// fill out the loop is aria-hidden and decorative (alt="").
		expect(screen.getAllByAltText("")).toHaveLength(8);
	});
});
