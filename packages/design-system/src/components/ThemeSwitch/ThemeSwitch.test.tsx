import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
		localStorage.clear();
	});
	afterEach(() => {
		document.documentElement.removeAttribute("data-theme");
	});

	it("starts on System, naming what a press does next", () => {
		const button = renderSwitch();
		expect(button).toHaveTextContent("brightness_auto");
		expect(button).toHaveAccessibleName("Switch to light theme");
	});

	it("cycles System, Light, Dark, then System, glyph and label together", () => {
		const button = renderSwitch();
		const seen: [string | null, string | null][] = [];
		for (let press = 0; press < 3; press++) {
			fireEvent.click(button);
			seen.push([button.textContent, button.getAttribute("aria-label")]);
		}
		expect(seen).toEqual([
			["light_mode", "Switch to dark theme"],
			["dark_mode", "Switch to system theme"],
			["brightness_auto", "Switch to light theme"],
		]);
	});

	it("does not animate the glyph on first render", () => {
		const button = renderSwitch();
		expect(glyph(button)).not.toHaveAttribute("data-animated");
	});

	it("animates the glyph a press brings in", () => {
		const button = renderSwitch();
		fireEvent.click(button);
		expect(glyph(button)).toHaveAttribute("data-animated");
	});
});
