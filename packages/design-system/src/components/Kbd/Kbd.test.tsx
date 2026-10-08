import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, test } from "vitest";

import { ShortcutPeekProvider } from "../ShortcutPeek/ShortcutPeek.tsx";

import { Kbd } from "./Kbd.tsx";

describe("Kbd", () => {
	it("renders one <kbd> per key, inside the chord's own <kbd>", () => {
		// Not one run-together string: "CtrlK" is not a thing anyone presses,
		// and a screen reader needs each key to be its own element.
		const { container } = render(() => <Kbd shortcut="Mod+K" />);
		const keys = container.querySelectorAll("kbd kbd");
		expect([...keys].map((k) => k.textContent)).toEqual(["Ctrl", "K"]);
	});

	it("renders a named key as its glyph", () => {
		render(() => <Kbd shortcut="Escape" />);
		expect(screen.getByText("Esc")).toBeInTheDocument();
	});

	it("uppercases a single letter, the way it reads on the keyboard", () => {
		render(() => <Kbd shortcut="K" />);
		expect(screen.getByText("K")).toBeInTheDocument();
	});

	it("renders one nested kbd per glyph of a typed hotkey", () => {
		render(() => <Kbd shortcut="Mod+K" />);
		const chord = screen.getByRole("group", { name: "Mod+K" });
		const keys = chord.querySelectorAll("kbd");
		expect(keys).toHaveLength(2);
		expect(keys[1].textContent).toBe("K");
	});

	it("renders a bare letter as a single key", () => {
		render(() => <Kbd shortcut="D" />);
		const keys = screen
			.getByRole("group", { name: "D" })
			.querySelectorAll("kbd");
		expect(keys).toHaveLength(1);
		expect(keys[0].textContent).toBe("D");
	});

	it("renders a display-only label as one key (a range, not a hotkey)", () => {
		render(() => <Kbd label="0–9" />);
		const keys = screen
			.getByRole("group", { name: "0–9" })
			.querySelectorAll("kbd");
		expect(keys).toHaveLength(1);
		expect(keys[0].textContent).toBe("0–9");
	});
});

test("children make the chip and its words one hint", () => {
	const { container } = render(() => <Kbd shortcut="Enter">to open</Kbd>);
	const hint = container.firstElementChild as HTMLElement;
	expect(hint.tagName).toBe("SPAN");
	expect(hint.className).toMatch(/hint/);
	expect(hint.textContent).toContain("to open");
	expect(hint.querySelector("kbd[role='group']")).not.toBeNull();
});

test("a bare chip has no hint wrapper", () => {
	const { container } = render(() => <Kbd shortcut="Enter" />);
	expect(container.firstElementChild?.tagName).toBe("KBD");
});

test("an inline hint is hidden until peeking, words and all", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Kbd shortcut="D" inline>
				to dismiss
			</Kbd>
		</ShortcutPeekProvider>
	));
	expect(screen.queryByText("to dismiss")).toBeNull();
});

test("an inline chip is hidden until peeking", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Kbd shortcut="D" inline />
		</ShortcutPeekProvider>
	));
	expect(screen.queryByRole("group", { name: "D" })).toBeNull();
	fireEvent.keyDown(document, { key: "Alt", altKey: true });
	expect(screen.getByRole("group", { name: "D" })).toBeInTheDocument();
});

test("a tooltip chip renders regardless of peeking", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Kbd shortcut="D" />
		</ShortcutPeekProvider>
	));
	expect(screen.getByRole("group", { name: "D" })).toBeInTheDocument();
});
