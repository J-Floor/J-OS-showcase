// @vitest-environment jsdom
import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { RollLabel } from "./RollLabel.tsx";

describe("RollLabel", () => {
	it("renders the label once in the DOM and exposes it for the roll copy", () => {
		render(() => (
			<a href="/contact">
				<RollLabel label="Contact" />
			</a>
		));
		expect(
			screen.getByRole("link", { name: "Contact" })
		).toBeInTheDocument();
		expect(screen.getAllByText("Contact")).toHaveLength(1);
		expect(screen.getByText("Contact").parentElement).toHaveAttribute(
			"data-label",
			"Contact"
		);
	});
});
