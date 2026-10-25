import { render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JFloorProvider, useTheme } from "./JFloorProvider.tsx";
import { blockStorage } from "./test/blockedStorage.ts";

function ThemeToggle() {
	const { theme, toggle } = useTheme();
	return (
		<button type="button" onClick={toggle}>
			{theme()}
		</button>
	);
}

describe("JFloorProvider theme storage", () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		document.documentElement.removeAttribute("data-theme");
	});

	it("starts from the stored theme", () => {
		localStorage.setItem("jf-theme", "dark");
		render(() => (
			<JFloorProvider>
				<ThemeToggle />
			</JFloorProvider>
		));
		expect(screen.getByRole("button")).toHaveTextContent("dark");
	});

	it("stores the toggled theme as its raw name", () => {
		localStorage.setItem("jf-theme", "light");
		render(() => (
			<JFloorProvider>
				<ThemeToggle />
			</JFloorProvider>
		));
		screen.getByRole("button").click();
		expect(localStorage.getItem("jf-theme")).toBe("dark");
	});

	it("renders and toggles where reading localStorage throws", () => {
		const restore = blockStorage();
		try {
			render(() => (
				<JFloorProvider>
					<ThemeToggle />
				</JFloorProvider>
			));
			const button = screen.getByRole("button");
			const before = button.textContent;
			button.click();
			expect(button.textContent).not.toBe(before);
			expect(document.documentElement).toHaveAttribute(
				"data-theme",
				button.textContent
			);
		} finally {
			restore();
		}
	});
});
