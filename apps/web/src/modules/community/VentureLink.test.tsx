// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { VentureLink } from "./VentureLink.tsx";

afterEach(cleanup);

test("an unflagged link is an anchor that opens in a new tab", () => {
	render(() => (
		<VentureLink
			link={{ label: "Site", url: "https://good.example/" }}
			class="extra"
		/>
	));
	const anchor = screen.getByRole("link", { name: "Site" });
	expect(anchor).toHaveAttribute("href", "https://good.example/");
	expect(anchor).toHaveAttribute("target", "_blank");
	expect(anchor).toHaveClass("extra");
});

test("an unlabelled link shows its URL", () => {
	render(() => (
		<VentureLink link={{ label: "", url: "https://good.example/" }} />
	));
	expect(screen.getByRole("link")).toHaveTextContent("https://good.example/");
});

test("a flagged link is text with a warning, never an anchor", () => {
	render(() => (
		<VentureLink
			link={{
				label: "",
				url: "https://evil.example/",
				threat: "MALWARE",
			}}
		/>
	));
	expect(screen.queryByRole("link")).toBeNull();
	expect(screen.getByText(/https:\/\/evil\.example\//)).toBeInTheDocument();
});
