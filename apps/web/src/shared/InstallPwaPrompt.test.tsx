// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { InstallPwaPrompt } from "./InstallPwaPrompt.tsx";
import { resetInstallPromptForTest } from "./pwaInstall.ts";

beforeEach(() => {
	// The captured prompt is a module-level singleton — reset it so cases start
	// clean and do not leak into one another.
	resetInstallPromptForTest();
	try {
		localStorage.clear();
	} catch {
		// no-op
	}
});
afterEach(cleanup);

function fireBeforeInstallPrompt(outcome = "accepted"): {
	prompt: ReturnType<typeof vi.fn>;
} {
	const prompt = vi.fn(() => Promise.resolve());
	const event = new Event("beforeinstallprompt", {
		cancelable: true,
	}) as Event & {
		prompt: typeof prompt;
		userChoice: Promise<{ outcome: string }>;
	};
	event.prompt = prompt;
	event.userChoice = Promise.resolve({ outcome });
	window.dispatchEvent(event);
	return { prompt };
}

test("hidden until the browser offers an install prompt", () => {
	render(() => <InstallPwaPrompt />);
	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
});

test("shows the pill on beforeinstallprompt and fires the real prompt on click", async () => {
	render(() => <InstallPwaPrompt />);
	const { prompt } = fireBeforeInstallPrompt();

	const pill = await screen.findByText("Install app");
	fireEvent.click(pill);
	expect(prompt).toHaveBeenCalledOnce();
});

test("captures an event fired BEFORE the pill mounts (the late-mount fix)", async () => {
	// The real bug: the pill lives deep in the authed shell and mounts late,
	// while `beforeinstallprompt` fires early on load. The module-level listener
	// must have captured it already, so a mount afterwards still shows the pill.
	fireBeforeInstallPrompt();
	render(() => <InstallPwaPrompt />);
	expect(await screen.findByText("Install app")).toBeInTheDocument();
});

test("preventDefault stops the browser's own mini-infobar", () => {
	render(() => <InstallPwaPrompt />);
	const prompt = vi.fn(() => Promise.resolve());
	const event = new Event("beforeinstallprompt", {
		cancelable: true,
	}) as Event & { prompt: typeof prompt; userChoice: Promise<unknown> };
	event.prompt = prompt;
	event.userChoice = Promise.resolve({ outcome: "dismissed" });
	window.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
});

test("Dismiss hides the pill", async () => {
	render(() => <InstallPwaPrompt />);
	fireBeforeInstallPrompt();
	await screen.findByText("Install app");

	fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
	// Persistence across reloads rides on localStorage (unavailable in this
	// env, like WhatsNew) — its round-trip is exercised on CI, not here.
});

test("hidden on iOS Safari — an installed iOS app cannot finish email sign-in", () => {
	const ua = vi
		.spyOn(navigator, "userAgent", "get")
		.mockReturnValue(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
		);
	render(() => <InstallPwaPrompt />);
	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
	ua.mockRestore();
});

const SAMSUNG_UA =
	"Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36";
const FIREFOX_ANDROID_UA =
	"Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0";
const OPERA_ANDROID_UA =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 OPR/85.0.0.0";

function mockUserAgent(ua: string) {
	return vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

test.each([
	[SAMSUNG_UA, "Add page to"],
	[FIREFOX_ANDROID_UA, "Add app to Home screen"],
	[OPERA_ANDROID_UA, "Open your browser menu"],
])("no prompt on %s: the pill opens menu steps", async (ua, step) => {
	const spy = mockUserAgent(ua);
	render(() => <InstallPwaPrompt />);

	fireEvent.click(await screen.findByText("Install app"));

	expect(await screen.findByText(step, { exact: false })).toBeInTheDocument();
	spy.mockRestore();
});

test("Dismiss hides the instructions pill too", async () => {
	const spy = mockUserAgent(SAMSUNG_UA);
	render(() => <InstallPwaPrompt />);
	await screen.findByText("Install app");

	fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
	spy.mockRestore();
});

test("hidden on Chrome Android with no captured prompt (installed or not eligible)", () => {
	const spy = mockUserAgent(
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
	);
	render(() => <InstallPwaPrompt />);
	expect(screen.queryByText("Install app")).not.toBeInTheDocument();
	spy.mockRestore();
});
