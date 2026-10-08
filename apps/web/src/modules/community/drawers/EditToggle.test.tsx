// @vitest-environment happy-dom
import { render, fireEvent, cleanup } from "@solidjs/testing-library";
import { HotkeysProvider } from "@tanstack/solid-hotkeys";
import { afterEach, expect, test } from "vitest";

import { EditToggle } from "./EditToggle.tsx";

// `@solidjs/testing-library`'s auto-cleanup only registers itself when it
// finds a GLOBAL `afterEach`, and apps/web does not run vitest in `globals`
// mode — see the equivalent note in `createActionKeys.test.tsx`. Without
// this, `E`'s `document`-level registration from one test outlives it.
afterEach(cleanup);

/**
 * `EditToggle` does not set `ignoreInputs` itself — it relies on the app
 * root's `HotkeysProvider` supplying `false` (see the component's own
 * comment). Without that provider here, the library's OWN typing guard
 * (`ignoreInputs`, default `true`) would already block a keystroke whose
 * `event.target` is an `<input>`, regardless of whether `isTypingTarget` (the
 * guard this file actually tests) is even called — so a test for that guard
 * without this wrapper would pass for the wrong reason. Mirrors `app.tsx`.
 */
function renderToggle(props: { enabled: boolean; onToggle: () => void }): void {
	render(() => (
		<HotkeysProvider defaultOptions={{ hotkey: { ignoreInputs: false } }}>
			<EditToggle
				editing={false}
				enabled={props.enabled}
				onToggle={props.onToggle}
			/>
		</HotkeysProvider>
	));
}

test("E toggles edit mode when enabled", () => {
	let toggled = 0;
	renderToggle({
		enabled: true,
		onToggle: () => {
			toggled += 1;
		},
	});
	fireEvent.keyDown(document, { key: "e" });
	expect(toggled).toBe(1);
});

test("E does nothing when the toggle is not enabled", () => {
	let toggled = 0;
	renderToggle({
		enabled: false,
		onToggle: () => {
			toggled += 1;
		},
	});
	fireEvent.keyDown(document, { key: "e" });
	expect(toggled).toBe(0);
});

test("E does nothing while focus is in a text input", () => {
	let toggled = 0;
	renderToggle({
		enabled: true,
		onToggle: () => {
			toggled += 1;
		},
	});
	const field = document.createElement("input");
	document.body.append(field);
	fireEvent.keyDown(field, { key: "e" });
	expect(toggled).toBe(0);
});
