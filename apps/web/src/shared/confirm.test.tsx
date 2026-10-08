// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { afterEach, expect, test } from "vitest";

import { ConfirmProvider, useConfirm } from "./confirm.tsx";

afterEach(cleanup);

function Harness(props: { onResult: (ok: boolean) => void }) {
	const confirm = useConfirm();
	return (
		<button
			onClick={() => {
				void confirm({
					title: "Turn down application?",
					message: "Deny this application?",
					confirmLabel: "Turn down",
					tone: "danger",
				}).then(props.onResult);
			}}
		>
			open
		</button>
	);
}

/**
 * The requirement this task exists for — the CONFIRM button takes initial
 * focus, so a decision fired by key can be completed with Enter — cannot be
 * verified here, and this records why rather than pretending otherwise.
 *
 * Ark's modal Dialog hands initial focus to `@zag-js/focus-trap`, built on
 * `tabbable`, which decides what is focusable by MEASURING it. jsdom lays
 * nothing out, so every candidate measures zero, the trap focuses nothing, and
 * `document.activeElement` stays `<body>` whether or not `initialFocusEl` is
 * set. jsdom also never synthesises a click from Enter on a focused button, so
 * "Enter confirms" is equally unreachable. Both are real browser behaviours,
 * not application logic.
 *
 * An earlier version of this file asserted `document.activeElement` anyway and
 * shipped red, and paired it with an "Enter confirms" test that pressed Enter
 * and THEN clicked the button — the click did the work, so it passed with the
 * fix reverted. A test that cannot fail is worse than no test.
 *
 * Verified by hand instead, in Chrome on 2026-08-04 against this branch: with
 * a person drawer open, pressing "Turn down" opened the confirm dialog with
 * `document.activeElement` reporting the "Turn down" confirm button — not
 * Cancel, not the close trigger. Enter activating a focused button is native
 * browser behaviour and needs no assertion of ours.
 *
 * Re-verify by hand if `initialFocusEl` in confirm.tsx changes.
 */
test.skip("the confirm button takes initial focus (browser-only, see comment)", () => {
	// Intentionally empty: see the comment above.
});

test("confirming resolves true", async () => {
	const results: boolean[] = [];
	render(() => (
		<ConfirmProvider>
			<Harness onResult={(ok) => results.push(ok)} />
		</ConfirmProvider>
	));
	fireEvent.click(screen.getByText("open"));
	fireEvent.click(await screen.findByRole("button", { name: /turn down/i }));
	await waitFor(() => {
		expect(results).toEqual([true]);
	});
});

test("cancelling resolves false", async () => {
	const results: boolean[] = [];
	render(() => (
		<ConfirmProvider>
			<Harness onResult={(ok) => results.push(ok)} />
		</ConfirmProvider>
	));
	fireEvent.click(screen.getByText("open"));
	fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));
	await waitFor(() => {
		expect(results).toEqual([false]);
	});
});
