import { render, screen } from "@solidjs/testing-library";

import { Icon } from "./Icon.tsx";

test("renders ligature + aria-hidden + data-icon", () => {
	render(() => <Icon>check</Icon>);
	const element = screen.getByText("check");
	expect(element).toHaveAttribute("aria-hidden", "true");
	// data-icon is what lets typography mixins size the glyph via [data-icon].
	expect(element).toHaveAttribute("data-icon");
});
