import { existsSync } from "node:fs";

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";

import { partnerGroups, partners } from "./partners.ts";
import { Partners } from "./Partners.tsx";

afterEach(() => {
	cleanup();
	history.replaceState(null, "", "/");
});
it("publishes the complete categorized catalogue with local artwork", () => {
	expect(partners).toHaveLength(43);
	expect(new Set(partners.map((partner) => partner.name)).size).toBe(43);
	expect(
		partnerGroups.map(
			(group) =>
				partners.filter((partner) => partner.group === group.id).length
		)
	).toEqual([7, 5, 31]);
	for (const partner of partners) {
		expect(new URL(partner.url).protocol).toBe("https:");
		expect(
			existsSync(
				`${process.cwd()}/public/assets/partners/${partner.file}`
			)
		).toBe(true);
	}
	expect(partners.some((partner) => partner.name === "Swisscom")).toBe(false);
	expect(partners.find((partner) => partner.name === "Alfred")?.group).toBe(
		"sponsors"
	);
	render(() => <Partners />);
	expect(screen.queryByText("Exclusive legal partner")).toBeNull();
	expect(screen.getAllByRole("img")).toHaveLength(43);
	expect(
		screen.queryByRole("group", { name: "Partner section layout" })
	).toBeNull();
});
it("keeps every logo visible and removes review controls even on old preview URLs", () => {
	history.replaceState(null, "", "/?partners=compact#partners");
	const { container } = render(() => <Partners />);
	expect(screen.getAllByRole("img")).toHaveLength(43);
	expect(screen.queryByText("Compare layouts")).toBeNull();
	expect(container.querySelector("details")).toBeNull();
});
