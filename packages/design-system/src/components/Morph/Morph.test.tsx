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

test("asChild merges the consumer's own props, as an Ark asChild does", () => {
	render(() => (
		<Morph
			of={id}
			asChild={(morph) => (
				<button {...morph({ class: "card" })} type="button">
					card
				</button>
			)}
		/>
	));
	const card = screen.getByRole("button", { name: "card" });
	expect(card).toHaveClass("card");
	expect(card).toHaveAttribute("data-morph-of", "abc");
});
