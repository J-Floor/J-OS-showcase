import { render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JFloorProvider, useTheme } from "./JFloorProvider.tsx";
import { blockStorage } from "./test/blockedStorage.ts";

const PREFERENCE_KEY = "jf-theme-preference";

function ThemeProbe() {
	const { theme, preference, cycle } = useTheme();
	return (
		<button type="button" onClick={cycle}>
			{preference()}/{theme()}
		</button>
	);
}

function renderProbe(theme?: "light" | "dark") {
	return render(() => (
		<JFloorProvider theme={theme}>
			<ThemeProbe />
		</JFloorProvider>
	));
}

function probe(): HTMLElement {
	return screen.getByRole("button");
}

/** A `prefers-color-scheme: dark` query whose changes the test fires. */
function fakeColorScheme(isDark: boolean) {
	const listeners = new Set<() => void>();
	const query = {
		matches: isDark,
		addEventListener: vi.fn((_type: string, listener: () => void) =>
			listeners.add(listener)
		),
		removeEventListener: vi.fn((_type: string, listener: () => void) =>
			listeners.delete(listener)
		),
	};
	vi.stubGlobal("matchMedia", () => query);
	return {
		query,
		setDark(isNowDark: boolean) {
			query.matches = isNowDark;
			for (const listener of listeners) listener();
		},
	};
}

describe("JFloorProvider theme preference", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		document.documentElement.removeAttribute("data-theme");
		vi.unstubAllGlobals();
	});

	it("defaults to System, resolved from the device", () => {
		fakeColorScheme(true);
		renderProbe();
		expect(probe()).toHaveTextContent("system/dark");
		expect(document.documentElement).toHaveAttribute("data-theme", "dark");
	});

	it("follows the device live under System", () => {
		const scheme = fakeColorScheme(false);
		renderProbe();
		expect(probe()).toHaveTextContent("system/light");
		scheme.setDark(true);
		expect(probe()).toHaveTextContent("system/dark");
		expect(document.documentElement).toHaveAttribute("data-theme", "dark");
	});

	it("keeps an explicit choice when the device changes", () => {
		const scheme = fakeColorScheme(false);
		localStorage.setItem(PREFERENCE_KEY, "light");
		renderProbe();
		scheme.setDark(true);
		expect(probe()).toHaveTextContent("light/light");
	});

	it("stops listening to the device on unmount", () => {
		const scheme = fakeColorScheme(false);
		const { unmount } = renderProbe();
		const listener = scheme.query.addEventListener.mock.calls[0]?.[1];
		expect(listener).toBeTypeOf("function");
		unmount();
		expect(scheme.query.removeEventListener).toHaveBeenCalledWith(
			"change",
			listener
		);
	});

	it("cycles System, Light, Dark, then System again", () => {
		fakeColorScheme(true);
		renderProbe();
		const seen = [probe().textContent];
		for (let press = 0; press < 3; press++) {
			probe().click();
			seen.push(probe().textContent);
		}
		expect(seen).toEqual([
			"system/dark",
			"light/light",
			"dark/dark",
			"system/dark",
		]);
	});

	it("stores the preference as its raw name under its own key", () => {
		renderProbe();
		probe().click();
		expect(localStorage.getItem(PREFERENCE_KEY)).toBe("light");
		probe().click();
		probe().click();
		expect(localStorage.getItem(PREFERENCE_KEY)).toBe("system");
	});

	it("starts from the stored preference", () => {
		localStorage.setItem(PREFERENCE_KEY, "dark");
		renderProbe();
		expect(probe()).toHaveTextContent("dark/dark");
	});

	it("ignores a theme stored under the old key", () => {
		fakeColorScheme(false);
		localStorage.setItem("jf-theme", "dark");
		renderProbe();
		expect(probe()).toHaveTextContent("system/light");
	});

	it("lets a controlled theme prop win", () => {
		fakeColorScheme(false);
		localStorage.setItem(PREFERENCE_KEY, "light");
		renderProbe("dark");
		expect(document.documentElement).toHaveAttribute("data-theme", "dark");
		probe().click();
		expect(document.documentElement).toHaveAttribute("data-theme", "dark");
	});

	it("renders and cycles where reading localStorage throws", () => {
		const restore = blockStorage();
		try {
			renderProbe();
			expect(probe()).toHaveTextContent("system/light");
			probe().click();
			expect(probe()).toHaveTextContent("light/light");
			expect(document.documentElement).toHaveAttribute(
				"data-theme",
				"light"
			);
		} finally {
			restore();
		}
	});
});
