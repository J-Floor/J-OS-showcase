import { fireEvent, render, screen } from "@solidjs/testing-library";
import { beforeEach, describe, expect, it } from "vitest";

import { JFloorProvider } from "../../JFloorProvider.tsx";

import { ThemeSwitch } from "./ThemeSwitch.tsx";

function renderSwitch(): HTMLElement {
	render(() => (
		<JFloorProvider>
			<ThemeSwitch />
		</JFloorProvider>
	));
	return screen.getByRole("button");
}

function glyph(button: HTMLElement): HTMLElement | null | undefined {
	return button.querySelector("[data-icon]")?.parentElement;
}

describe("ThemeSwitch", () => {
	beforeEach(() => {
		localStorage.setItem("jf-theme", "light");
	});

	it("names the theme a press switches to", () => {
		const button = renderSwitch();
		expect(button).toHaveAccessibleName("Switch to dark theme");
		fireEvent.click(button);
		expect(button).toHaveAccessibleName("Switch to light theme");
	});

	it("does not animate the glyph on first render", () => {
		const button = renderSwitch();
		expect(glyph(button)).not.toHaveAttribute("data-animated");
	});

	it("animates the glyph a toggle brings in", () => {
		const button = renderSwitch();
		fireEvent.click(button);
		expect(glyph(button)).toHaveAttribute("data-animated");
	});
});
