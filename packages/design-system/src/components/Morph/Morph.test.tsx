import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { Morph } from "./Morph.tsx";

const id = "abc";

test("renders a div carrying the entity id", () => {
	render(() => <Morph of={id}>content</Morph>);
	expect(screen.getByText("content")).toHaveAttribute("data-morph-of", "abc");
});

test("asChild puts the id on the consumer's element", () => {
	render(() => (
		<Morph
			of={id}
			asChild={(morph) => <article {...morph()}>card</article>}
		/>
	));
	expect(screen.getByText("card").tagName).toBe("ARTICLE");
	expect(screen.getByText("card")).toHaveAttribute("data-morph-of", "abc");
});
