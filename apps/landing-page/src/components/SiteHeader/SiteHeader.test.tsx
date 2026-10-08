// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { SiteHeader } from "./SiteHeader.tsx";

afterEach(() => {
	cleanup();
});

describe("SiteHeader", () => {
	it("renders the J floor wordmark linking home", async () => {
		render(() => (
			<Router>
				<Route path="/" component={SiteHeader} />
			</Router>
		));
		const wordmark = await screen.findByRole("link", { name: /j floor/iu });
		expect(wordmark.getAttribute("href")).toBe("/");
	});

	it("renders the apply pill linking to /contact", async () => {
		render(() => (
			<Router>
				<Route path="/" component={SiteHeader} />
			</Router>
		));
		const applyLink = await screen.findByRole("link", {
			name: /apply to join/iu,
		});
		expect(applyLink.getAttribute("href")).toBe("/contact");
	});
});
