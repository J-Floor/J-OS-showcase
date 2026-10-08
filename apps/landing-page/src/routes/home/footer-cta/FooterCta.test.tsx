// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { FooterCta } from "./FooterCta.tsx";

afterEach(() => {
	cleanup();
});

describe("FooterCta", () => {
	it("renders the closing heading", async () => {
		render(() => (
			<Router>
				<Route path="/" component={FooterCta} />
			</Router>
		));
		expect(
			await screen.findByRole("heading", {
				name: /a startup base in the heart of zurich/iu,
			})
		).toBeTruthy();
	});

	it("renders the apply pill linking to the app sign-up", async () => {
		render(() => (
			<Router>
				<Route path="/" component={FooterCta} />
			</Router>
		));
		const applyLink = await screen.findByRole("link", {
			name: /apply to join/iu,
		});
		expect(applyLink.getAttribute("href")).toBe(
			"https://app.thejfloor.com/sign-up"
		);
	});

	it("renders the footer link columns", () => {
		render(() => (
			<Router>
				<Route path="/" component={FooterCta} />
			</Router>
		));
		expect(screen.getByRole("link", { name: /home/iu })).toBeTruthy();
		expect(screen.getByRole("link", { name: /linkedin/iu })).toBeTruthy();
		expect(screen.getByRole("link", { name: /email/iu })).toBeTruthy();
	});
});
