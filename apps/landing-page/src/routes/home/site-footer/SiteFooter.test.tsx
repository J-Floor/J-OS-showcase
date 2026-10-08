// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "./SiteFooter.tsx";

describe("SiteFooter", () => {
	it("renders the wordmark and the nemu studio credit link", () => {
		render(() => <SiteFooter />);
		expect(
			screen.getByRole("img", { name: "J floor" })
		).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /nemu/iu })
		).toBeInTheDocument();
	});

	it("links the app's public privacy notice", () => {
		render(() => <SiteFooter />);
		expect(
			screen.getByRole("link", { name: "Privacy notice" })
		).toHaveAttribute("href", "https://app.thejfloor.com/privacy");
	});
});
