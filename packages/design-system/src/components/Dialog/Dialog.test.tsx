import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { Dialog } from "./Dialog.tsx";

afterEach(cleanup);

/*
 * NOT TESTED HERE: that an opening dialog focuses itself rather than the close
 * button inside it (see `Root` in Dialog.tsx).
 *
 * It cannot be. The focus trap picks the first TABBABLE descendant, and
 * `tabbable` treats a zero-size element as untabbable. jsdom performs no
 * layout, so every element measures 0×0, no descendant qualifies, and the trap
 * falls back to focusing the content — which is the very outcome the fix
 * produces. The assertion passes with the fix reverted, so it would pin
 * nothing. Verified in Chrome instead, by measuring the tooltip's recorded
 * reference box before and after.
 */

test("bakes in a close button with an accessible name", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Change role</Dialog.Title>
			</Dialog.Content>
		</Dialog.Root>
	));
	// The name comes from the IconButton's tooltip label; an icon-only button
	// that loses it reaches a screen reader as "button".
	expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
});

test("renders the title and content the caller passed", () => {
	render(() => (
		<Dialog.Root open>
			<Dialog.Content>
				<Dialog.Title>Change role</Dialog.Title>
				<Dialog.Description>Pick a destination.</Dialog.Description>
			</Dialog.Content>
		</Dialog.Root>
	));
	// The dialog is named by its title — the whole reason `Root` focuses the
	// content rather than the close button.
	const dialog = screen.getByRole("dialog");
	expect(dialog).toHaveAccessibleName("Change role");
	expect(screen.getByText("Pick a destination.")).toBeInTheDocument();
});
