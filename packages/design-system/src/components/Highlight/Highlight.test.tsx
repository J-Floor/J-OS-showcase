import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { Highlight } from "./Highlight.tsx";

describe("Highlight", () => {
	it("marks the match", () => {
		render(() => <Highlight text="Ada Lovelace" query="Love" />);
		expect(screen.getByText("Love").tagName).toBe("MARK");
	});

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

	it("renders the text untouched when nothing matches", () => {
		const { container } = render(() => (
			<Highlight text="Ada Lovelace" query="zzz" />
		));
		expect(container.textContent).toBe("Ada Lovelace");
		expect(container.querySelector("mark")).toBeNull();
	});
});
