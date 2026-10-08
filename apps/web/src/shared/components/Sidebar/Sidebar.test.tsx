// @vitest-environment happy-dom
import { MemoryRouter, Route } from "@solidjs/router";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { AbilityProvider, type Role } from "../../../lib/ability.tsx";

import { Sidebar } from "./Sidebar.tsx";

afterEach(cleanup);

function navLabels(role: Role): string[] {
	render(() => (
		<MemoryRouter>
			<Route
				path="*"
				component={() => (
					<AbilityProvider role={role}>
						<Sidebar />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
	return screen
		.getAllByRole("link")
		.map((link) => link.textContent)
		.filter((label) => label !== "");
}

test("staff see Community and Space, not Events", () => {
	const labels = navLabels("staff").join(" ");
	expect(labels).toContain("Community");
	expect(labels).toContain("Space");
	expect(labels).not.toContain("Events");
});

test("members see Events", () => {
	expect(navLabels("member").join(" ")).toContain("Events");
});
