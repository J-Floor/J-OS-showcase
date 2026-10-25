import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { MORPH_OF } from "../../utils/morphNames.ts";

import { Morph, morphAttributes } from "./Morph.tsx";

const id = "abc";

test("renders a div carrying the morph id", () => {
	render(() => <Morph morphId={id}>content</Morph>);
	expect(screen.getByText("content")).toHaveAttribute(MORPH_OF, "abc");
});

test("asChild puts the id on the consumer's element", () => {
	render(() => (
		<Morph
			morphId={id}
			asChild={(morph) => <article {...morph()}>card</article>}
		/>
	));
	expect(screen.getByText("card").tagName).toBe("ARTICLE");
	expect(screen.getByText("card")).toHaveAttribute(MORPH_OF, "abc");
});

test("asChild merges the consumer's own props, as an Ark asChild does", () => {
	render(() => (
		<Morph
			morphId={id}
			asChild={(morph) => (
				<button {...morph({ class: "card" })} type="button">
					card
				</button>
			)}
		/>
	));
	const card = screen.getByRole("button", { name: "card" });
	expect(card).toHaveClass("card");
	expect(card).toHaveAttribute(MORPH_OF, "abc");
});

test("morphAttributes marks the element with its id, and nothing without one", () => {
	expect(morphAttributes({ morphId: id })).toEqual({ [MORPH_OF]: id });
	expect(morphAttributes({})).toEqual({});
});
