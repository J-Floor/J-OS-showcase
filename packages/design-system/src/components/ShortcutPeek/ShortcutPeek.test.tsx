import { fireEvent, render, screen } from "@solidjs/testing-library";

import { ShortcutPeekProvider, useShortcutPeek } from "./ShortcutPeek.tsx";

function Probe() {
	const peek = useShortcutPeek();
	return (
		<>
			<span data-testid="state">{peek.peeking() ? "on" : "off"}</span>
			<button onClick={peek.toggleLatched}>toggle</button>
		</>
	);
}

test("peeking is off by default", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Probe />
		</ShortcutPeekProvider>
	));
	expect(screen.getByTestId("state").textContent).toBe("off");
});

test("the latch toggles peeking on and off", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Probe />
		</ShortcutPeekProvider>
	));
	fireEvent.click(screen.getByText("toggle"));
	expect(screen.getByTestId("state").textContent).toBe("on");
	fireEvent.click(screen.getByText("toggle"));
	expect(screen.getByTestId("state").textContent).toBe("off");
});

test("holding Alt turns peeking on, releasing turns it off", () => {
	render(() => (
		<ShortcutPeekProvider>
			<Probe />
		</ShortcutPeekProvider>
	));
	fireEvent.keyDown(document, { key: "Alt", altKey: true });
	expect(screen.getByTestId("state").textContent).toBe("on");
	fireEvent.keyUp(document, { key: "Alt", altKey: false });
	expect(screen.getByTestId("state").textContent).toBe("off");
});

test("without a provider, peeking is simply off", () => {
	render(() => <Probe />);
	expect(screen.getByTestId("state").textContent).toBe("off");
});

function withPlatform(platform: string, run: () => void): void {
	const original = Object.getOwnPropertyDescriptor(
		Navigator.prototype,
		"platform"
	);
	Object.defineProperty(navigator, "platform", {
		value: platform,
		configurable: true,
	});
	try {
		run();
	} finally {
		if (original)
			Object.defineProperty(Navigator.prototype, "platform", original);
	}
}

function pressAlt(): boolean {
	const event = new KeyboardEvent("keydown", {
		key: "Alt",
		cancelable: true,
		bubbles: true,
	});
	document.dispatchEvent(event);
	return event.defaultPrevented;
}

test("off Apple, a bare Alt is swallowed so the browser menu bar stays put", () => {
	withPlatform("Win32", () => {
		render(() => (
			<ShortcutPeekProvider>
				<Probe />
			</ShortcutPeekProvider>
		));
		expect(pressAlt()).toBe(true);
	});
});

test("on Apple, Alt is left alone — it is Option, a text-entry modifier", () => {
	withPlatform("MacIntel", () => {
		render(() => (
			<ShortcutPeekProvider>
				<Probe />
			</ShortcutPeekProvider>
		));
		expect(pressAlt()).toBe(false);
	});
});
