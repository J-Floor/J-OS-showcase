// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

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
