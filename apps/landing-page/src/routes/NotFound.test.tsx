// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { NotFound } from "./NotFound.tsx";

describe("NotFound", () => {
	it("renders a 404 heading and a link home", async () => {
		render(() => (
			<Router>
				<Route path="/" component={NotFound} />
			</Router>
		));
		expect(
			await screen.findByRole("heading", { name: /404/iu })
		).toBeTruthy();
		expect(screen.getByRole("link", { name: /home/iu })).toBeTruthy();
	});
});
