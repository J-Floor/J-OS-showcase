// @vitest-environment happy-dom
import { createMemoryHistory, MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { PrivacyPolicy } from "./PrivacyPolicy.tsx";

afterEach(cleanup);

// No auth or Convex mock: the page must render with no session at all, as a
// signed-out applicant or visitor sees it.
test("renders the notice for a signed-out visitor at /privacy", () => {
	const history = createMemoryHistory();
	history.set({ value: "/privacy", scroll: false, replace: true });
	render(() => (
		<MemoryRouter history={history}>
			<Route path="/privacy" component={PrivacyPolicy} />
		</MemoryRouter>
	));

	expect(
		screen.getByRole("heading", { level: 1, name: "Privacy policy" })
	).toBeInTheDocument();
	expect(
		screen.getByRole("heading", { name: /Applicants and event visitors/ })
	).toBeInTheDocument();
});

test("names the providers that receive data and drops the Switzerland/EEA-only claim", () => {
	render(() => <PrivacyPolicy />);

	for (const provider of [
		"Convex",
		"Resend",
		"Cloudflare",
		"Google",
		"Hetzner",
		"door-lock provider",
		"push services",
	]) {
		expect(
			screen.getAllByText(new RegExp(provider, "u"), { selector: "li" })
		).not.toHaveLength(0);
	}
	expect(screen.queryByText(/web fonts/u)).not.toBeInTheDocument();
	expect(
		screen.queryByText(
			/located in Switzerland or the European Economic Area/u
		)
	).not.toBeInTheDocument();
});
