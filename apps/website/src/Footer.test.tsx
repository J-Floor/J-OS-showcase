import { cleanup, render, screen, within } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";

import { Footer } from "./Footer.tsx";

afterEach(cleanup);

it("shows the visiting address and registration with the J floor identity", () => {
	render(() => <Footer />);
	const footer = screen.getByRole("contentinfo");
	expect(within(footer).getByRole("img", { name: "J floor" })).toBeTruthy();
	expect(footer.querySelector("address")?.textContent).toBe(
		"Josefstrasse 2068005 Zürich, Switzerland"
	);
	expect(within(footer).getByText("CHE-319.745.061")).toBeTruthy();
	expect(footer.textContent).not.toMatch(/designed by|nemu/iu);
});

it("exposes contact and community destinations as named text links", () => {
	render(() => <Footer />);
	const contact = within(screen.getByRole("navigation", { name: "Contact" }));
	const community = within(
		screen.getByRole("navigation", { name: "Community" })
	);
	const destinations = [
		[contact, "contact@thejfloor.com", "mailto:contact@thejfloor.com"],
		[contact, "Privacy policy", "https://app.thejfloor.com/privacy"],
		[
			community,
			"Apply for membership",
			"https://app.thejfloor.com/sign-up",
		],
		[community, "LinkedIn", "https://www.linkedin.com/company/j-floor/"],
		[community, "Events on Luma", "https://luma.com/user/jfloor"],
	] as const;
	for (const [group, name, href] of destinations) {
		expect(group.getByRole("link", { name }).getAttribute("href")).toBe(
			href
		);
	}
});
