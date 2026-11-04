// @vitest-environment happy-dom
import { ShortcutPeekProvider } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { ShortcutPeekButton } from "../ShortcutPeekButton.tsx";

import { WifiContent } from "./WifiContent.tsx";

afterEach(cleanup);

function stubClipboard() {
	const writeText = vi.fn(() => Promise.resolve());
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	return writeText;
}

test("renders the SSID and never the password", () => {
	render(() => <WifiContent ssid="J floor" password="test-wifi-password" />);
	expect(screen.getByText("J floor")).toBeInTheDocument();
	expect(screen.queryByText("test-wifi-password")).toBeNull();
});

test("copies the password to the clipboard without ever rendering it", () => {
	const writeText = stubClipboard();
	render(() => <WifiContent ssid="J floor" password="test-wifi-password" />);

	const copyButton = screen.getByRole("button", { name: /copy password/i });
	fireEvent.click(copyButton);

	expect(writeText).toHaveBeenCalledWith("test-wifi-password");
	// Still not revealed after copying.
	expect(screen.queryByText("test-wifi-password")).toBeNull();
});

test("C copies the password once while the keys are active", () => {
	const writeText = stubClipboard();
	render(() => (
		<WifiContent ssid="J floor" password="test-wifi-password" keysActive />
	));
	fireEvent.keyDown(document, { key: "c" });
	expect(writeText).toHaveBeenCalledTimes(1);
	expect(writeText).toHaveBeenCalledWith("test-wifi-password");
	fireEvent.keyDown(document, { key: "c", repeat: true });
	expect(writeText).toHaveBeenCalledTimes(1);
});

test("C is ignored while typing and while the keys are not active", () => {
	const writeText = stubClipboard();
	render(() => (
		<>
			<input aria-label="note" />
			<WifiContent
				ssid="J floor"
				password="test-wifi-password"
				keysActive
			/>
		</>
	));
	fireEvent.keyDown(screen.getByLabelText("note"), { key: "c" });
	expect(writeText).not.toHaveBeenCalled();
	cleanup();
	render(() => <WifiContent ssid="J floor" password="test-wifi-password" />);
	fireEvent.keyDown(document, { key: "c" });
	expect(writeText).not.toHaveBeenCalled();
});

test("the copy button names its key, in a chip while peeking", () => {
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<WifiContent
				ssid="J floor"
				password="test-wifi-password"
				keysActive
			/>
		</ShortcutPeekProvider>
	));
	const copy = screen.getByRole("button", { name: "Copy password" });
	expect(copy).toHaveAttribute("aria-keyshortcuts", "C");
	expect(copy.querySelector("kbd")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
	expect(copy.querySelector("kbd")).not.toBeNull();
});
