import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Highlight } from "./Highlight.tsx";

describe("Highlight", () => {
	it("matches regardless of case, which is the whole point for names", () => {
		// Ark's own default is case-SENSITIVE; a lowercase query against a
		// capitalised name would mark nothing, and the component would look
		// broken rather than wrong.
		render(() => <Highlight text="Ada Lovelace" query="ada" />);
		expect(screen.getByText("Ada").tagName).toBe("MARK");
	});

	it("marks every occurrence, not just the first", () => {
		render(() => <Highlight text="banana" query="an" />);
		expect(screen.getAllByText("an")).toHaveLength(2);
	});

	it("forwards Ark's other props and the mark's attributes", () => {
		render(() => (
			<Highlight
				text="Ada Lovelace"
				query="Love"
				data-testid="match"
				class="extra"
			/>
		));
		const mark = screen.getByTestId("match");
		expect(mark).toHaveTextContent("Love");
		expect(mark).toHaveClass("extra");
	});
});
