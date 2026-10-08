// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Hero } from "./Hero.tsx";

describe("Hero", () => {
	it("renders the wordmark and the Apply to join link", async () => {
		render(() => (
			<Router>
				<Route path="/" component={Hero} />
			</Router>
		));

		expect(await screen.findByText(/j floor/iu)).toBeTruthy();

		const link = screen.getByRole("link", { name: /apply to join/iu });
		expect(link).toBeTruthy();
		expect(link.getAttribute("href")).toBe(
			"https://app.thejfloor.com/sign-up"
		);
	});
});
