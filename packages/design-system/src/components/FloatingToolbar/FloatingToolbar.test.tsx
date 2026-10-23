import { readFileSync } from "node:fs";

import { render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { FloatingToolbar } from "./FloatingToolbar.tsx";

test("renders its controls once, in one toolbar part", () => {
	render(() => (
		<FloatingToolbar data-testid="toolbar" class="extra">
			<button type="button">New</button>
		</FloatingToolbar>
	));
	const toolbar = screen.getByTestId("toolbar");
	expect(toolbar).toHaveAttribute("data-part", "floating-toolbar");
	expect(toolbar).toHaveClass("extra");
	expect(toolbar).toContainElement(screen.getByRole("button"));
	expect(screen.getAllByRole("button")).toHaveLength(1);
});

test("a caller can name the part (Tabs.Actions does)", () => {
	render(() => (
		<FloatingToolbar data-testid="toolbar" data-part="tab-actions">
			x
		</FloatingToolbar>
	));
	expect(screen.getByTestId("toolbar")).toHaveAttribute(
		"data-part",
		"tab-actions"
	);
});

test("publishes its height for the other bottom floaters, on a phone only", () => {
	const scss = readFileSync(
		`${import.meta.dirname}/FloatingToolbar.module.scss`,
		"utf8"
	);
	expect(scss).toMatch(
		/@include bp\.phone \{\s*:root:has\(\.toolbar\) \{\s*--jf-floating-toolbar-offset:/
	);
});
