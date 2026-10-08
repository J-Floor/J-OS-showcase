// @vitest-environment happy-dom
import { ShortcutPeekProvider } from "@j-os/design-system";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, test } from "vitest";

import { ShortcutPeekButton } from "./ShortcutPeekButton.tsx";

test("clicking the button latches peek on, clicking again turns it off", () => {
	render(() => (
		<ShortcutPeekProvider>
			<ShortcutPeekButton />
			<span data-testid="probe" />
		</ShortcutPeekProvider>
	));
	const button = screen.getByRole("button", { name: /shortcut/i });
	expect(button.getAttribute("aria-pressed")).toBe("false");
	fireEvent.click(button);
	expect(button.getAttribute("aria-pressed")).toBe("true");
	fireEvent.click(button);
	expect(button.getAttribute("aria-pressed")).toBe("false");
});
