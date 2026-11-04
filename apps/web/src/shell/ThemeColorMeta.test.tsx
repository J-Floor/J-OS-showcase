// @vitest-environment happy-dom
import { JFloorProvider, useTheme } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test } from "vitest";

import { ThemeColorMeta } from "./ThemeColorMeta.tsx";

const LIGHT = "#ffffff";
const DARK = "#232323";

function addMeta(colour: string, scheme: "light" | "dark"): HTMLMetaElement {
	const meta = document.createElement("meta");
	meta.name = "theme-color";
	meta.content = colour;
	meta.media = `(prefers-color-scheme: ${scheme})`;
	document.head.append(meta);
	return meta;
}

let lightMeta: HTMLMetaElement;
let darkMeta: HTMLMetaElement;

beforeEach(() => {
	localStorage.clear();
	lightMeta = addMeta(LIGHT, "light");
	darkMeta = addMeta(DARK, "dark");
});

afterEach(() => {
	cleanup();
	lightMeta.remove();
	darkMeta.remove();
});

function CycleButton() {
	const { preference, cycle } = useTheme();
	return (
		<button type="button" onClick={cycle}>
			{preference()}
		</button>
	);
}

function renderWithMeta(): HTMLElement {
	render(() => (
		<JFloorProvider>
			<ThemeColorMeta />
			<CycleButton />
		</JFloorProvider>
	));
	return screen.getByRole("button");
}

function colours(): [string, string] {
	return [lightMeta.content, darkMeta.content];
}

test("under System each status-bar colour keeps its own scheme", () => {
	renderWithMeta();
	expect(colours()).toEqual([LIGHT, DARK]);
});

test("an explicit choice pins both status-bar colours, and System restores them", () => {
	const button = renderWithMeta();
	fireEvent.click(button);
	expect(button).toHaveTextContent("light");
	expect(colours()).toEqual([LIGHT, LIGHT]);
	fireEvent.click(button);
	expect(button).toHaveTextContent("dark");
	expect(colours()).toEqual([DARK, DARK]);
	fireEvent.click(button);
	expect(button).toHaveTextContent("system");
	expect(colours()).toEqual([LIGHT, DARK]);
});

test("unmounting puts the original colours back", () => {
	const button = renderWithMeta();
	fireEvent.click(button);
	cleanup();
	expect(colours()).toEqual([LIGHT, DARK]);
});
