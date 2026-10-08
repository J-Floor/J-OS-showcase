// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Testimonials } from "./Testimonials.tsx";

describe("Testimonials", () => {
	it("renders the 'Network Matters' heading", async () => {
		render(() => <Testimonials />);
		expect(await screen.findByText(/Network Matters/iu)).toBeTruthy();
	});
});
