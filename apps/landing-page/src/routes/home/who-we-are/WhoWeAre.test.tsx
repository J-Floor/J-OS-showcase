// @vitest-environment jsdom
import { Route, Router } from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { WhoWeAre } from "./WhoWeAre.tsx";

describe("WhoWeAre", () => {
	it("renders the 'No equity. No fees.' commitment", async () => {
		render(() => (
			<Router>
				<Route path="/" component={WhoWeAre} />
			</Router>
		));
		expect(await screen.findByText(/No equity\. No fees\./iu)).toBeTruthy();
	});
});
