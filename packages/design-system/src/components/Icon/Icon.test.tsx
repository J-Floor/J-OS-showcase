import { render, screen } from "@solidjs/testing-library";

import { Icon } from "./Icon.tsx";

test("renders ligature + aria-hidden + data-icon", () => {
	render(() => <Icon>check</Icon>);
	const el = screen.getByText("check");
	expect(el).toHaveAttribute("aria-hidden", "true");
	// data-icon is what lets typography mixins size the glyph via [data-icon].
	expect(el).toHaveAttribute("data-icon");
});
