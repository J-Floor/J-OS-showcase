// @vitest-environment happy-dom
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

import { setUpdatingForTest } from "../lib/pwaUpdates.ts";
import { BRAND_SCREEN } from "../shared/components/Sidebar/brandFrame.ts";

import { createSplashHandoff } from "./splashHandoff.ts";

/** A splash holding the full logo's two parts, on screen. */
function mountSplash(): HTMLElement {
	const splash = document.createElement("div");
	splash.innerHTML = `
		<span data-logo-part="frame"></span>
		<span data-logo-part="mark"></span>`;
	document.body.append(splash);
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	return splash;
}

function fakeTransitions() {
	const start = vi.fn((update: () => unknown) => {
		const done = Promise.resolve().then(update);
		return { finished: done, updateCallbackDone: done };
	});
	Object.assign(document, { startViewTransition: start });
	vi.stubGlobal("matchMedia", () => ({ matches: false }));
	return start;
}

function handoff(options: { isWanted: boolean; landsOnRail?: boolean }) {
	const [isWanted, setWanted] = createSignal(options.isWanted);
	const [lands] = createSignal(options.landsOnRail ?? true);
	return createRoot((dispose) => {
		const result = createSplashHandoff(isWanted, lands);
		result.splashRef(mountSplash());
		return { ...result, setWanted, dispose };
	});
}

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition");
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	setUpdatingForTest(false);
	document.body.replaceChildren();
});

test("the shell shows at once when no splash is wanted", () => {
	const gate = handoff({ isWanted: false });
	expect(gate.isShellShown()).toBe(true);
	gate.dispose();
});

test("the shell follows the splash: hidden while wanted, shown after", () => {
	const gate = handoff({ isWanted: true });
	expect(gate.isShellShown()).toBe(false);
	gate.setWanted(false);
	expect(gate.isShellShown()).toBe(true);
	gate.setWanted(true);
	expect(gate.isShellShown()).toBe(false);
	gate.dispose();
});

test("a shell with the sidebar unfolds the logo in a transition", async () => {
	const start = fakeTransitions();
	const gate = handoff({ isWanted: true });
	gate.setWanted(false);
	expect(start).toHaveBeenCalledTimes(1);
	await vi.waitFor(() => {
		expect(gate.isShellShown()).toBe(true);
	});
	gate.dispose();
});

test("the logo lands on the marked shell where no sidebar shows its monogram (a phone)", async () => {
	const designSystem = await import("@j-os/design-system");
	const unfold = vi.spyOn(designSystem, "unfoldLogo");
	fakeTransitions();
	const gate = handoff({ isWanted: true });
	const shell = document.createElement("div");
	shell.setAttribute(BRAND_SCREEN, "");
	document.body.append(shell);
	gate.setWanted(false);
	expect(unfold.mock.calls[0]?.[0].screen?.()).toBe(shell);
	gate.dispose();
});

test("a shell without the sidebar (signed out, onboarding) swaps at once", () => {
	const start = fakeTransitions();
	const gate = handoff({ isWanted: true, landsOnRail: false });
	gate.setWanted(false);
	expect(start).not.toHaveBeenCalled();
	expect(gate.isShellShown()).toBe(true);
	gate.dispose();
});

test("while the app is updating the swap is instant", () => {
	const start = fakeTransitions();
	setUpdatingForTest(true);
	const gate = handoff({ isWanted: true });
	gate.setWanted(false);
	expect(start).not.toHaveBeenCalled();
	expect(gate.isShellShown()).toBe(true);
	gate.dispose();
});
