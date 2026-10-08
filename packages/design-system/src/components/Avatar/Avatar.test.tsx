import { render, screen } from "@solidjs/testing-library";

import { Avatar } from "./Avatar.tsx";
import { initials } from "./initials.ts";

// The initials helper is the only logic this wrapper adds on top of Ark's
// Avatar machine (image-load fallback is Ark's own, tested by Ark), so that is
// what these cover.

test("shows the initials of a two-word name", () => {
	render(() => <Avatar name="Ada Lovelace" />);
	expect(screen.getByText("AL")).toBeInTheDocument();
});

test("shows a single initial for a one-word name", () => {
	render(() => <Avatar name="Prince" />);
	expect(screen.getByText("P")).toBeInTheDocument();
});

test("renders an image with the name as alt when a src is given", () => {
	render(() => (
		<Avatar name="Ada Lovelace" src="https://example.test/a.png" />
	));
	expect(screen.getByAltText("Ada Lovelace")).toHaveAttribute(
		"src",
		"https://example.test/a.png"
	);
});

test("initials: first and last word, uppercased", () => {
	expect(initials("ada lovelace")).toBe("AL");
	expect(initials("Grace  Brewster  Hopper")).toBe("GH");
	expect(initials(" prince ")).toBe("P");
	expect(initials("")).toBe("");
});
