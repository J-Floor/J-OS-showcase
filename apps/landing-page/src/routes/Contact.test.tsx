// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Contact } from "./Contact.tsx";

describe("Contact", () => {
	it("renders the page heading and a mailto contact link", async () => {
		render(() => (
			<Router>
				<Route path="/" component={Contact} />
			</Router>
		));
		expect(
			await screen.findByRole("heading", { name: /we're listening/iu })
		).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /contact@thejfloor\.com/iu })
		).toHaveAttribute("href", "mailto:contact@thejfloor.com");
	});
});
