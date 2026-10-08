import { createSignal } from "solid-js";

/** Chromium's install prompt event (not in the DOM lib types). */
type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const [deferred, setDeferred] = createSignal<BeforeInstallPromptEvent>();
const [installed, setInstalled] = createSignal(false);

function onBeforeInstallPrompt(event: Event): void {
	// Stop Chromium's mini-infobar; the install pill drives the prompt instead.
	event.preventDefault();
	setDeferred(event as BeforeInstallPromptEvent);
}
function onInstalled(): void {
	setInstalled(true);
	setDeferred(undefined);
}

/**
 * Start listening at MODULE LOAD (this file is imported for its side effect
 * from the app entry), NOT from a component's `onMount`. `beforeinstallprompt`
 * fires early during page load — before the authed shell, and the install pill
 * inside it, have mounted — so a listener registered on mount misses the event
 * entirely and the pill never appears (the bug this fixes). Capturing it here,
 * before `render()`, means the event is already waiting when the pill mounts.
 */
if (typeof window !== "undefined") {
	window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
	window.addEventListener("appinstalled", onInstalled);
}

/**
 * True when the app runs as an installed PWA: a standalone display window, or
 * an iOS home-screen app (`navigator.standalone`). `matchMedia` is absent under
 * jsdom and very old browsers.
 */
export function isStandalone(): boolean {
	if (typeof window === "undefined") return false;
	const iosStandalone =
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	return (
		iosStandalone ||
		(typeof window.matchMedia === "function" &&
			window.matchMedia("(display-mode: standalone)").matches)
	);
}

/** The captured install prompt, or undefined until the browser offers one. */
export const installPrompt = deferred;
/** True once the app reports itself installed (via the `appinstalled` event). */
export const appInstalled = installed;

/** Fire the captured prompt (a one-shot; dropped afterwards). */
export async function runInstallPrompt(): Promise<void> {
	const event = deferred();
	if (!event) return;
	await event.prompt();
	await event.userChoice;
	setDeferred(undefined);
}

/** Test-only: clear the singleton so cases don't leak into one another. */
export function resetInstallPromptForTest(): void {
	setDeferred(undefined);
	setInstalled(false);
}

/**
 * How the install pill offers installation:
 * - `prompt`: the browser gave us `beforeinstallprompt`; fire it.
 * - `samsung` / `firefox` / `other-android`: an Android browser that never
 *   fires that event (Samsung Internet 27+, Firefox); show menu steps.
 * - `none`: no pill. Always on iOS, where an installed home-screen app keeps
 *   storage apart from Safari and cannot finish a magic-link sign-in. Also
 *   for Chrome and Edge on Android without a captured event: they fire it
 *   when installable, so silence means installed or not eligible.
 */
export type InstallMethod =
	| "prompt"
	| "samsung"
	| "firefox"
	| "other-android"
	| "none";

/**
 * True on iOS and iPadOS, including other browsers there (CriOS, FxiOS and
 * EdgiOS agents carry an iPhone or iPad token). iPadOS desktop mode reports a
 * Mac user agent; touch points tell it apart from a real Mac.
 */
export function isIosUserAgent(
	userAgent: string,
	maxTouchPoints: number
): boolean {
	return (
		/iPhone|iPad|iPod/.test(userAgent) ||
		(userAgent.includes("Macintosh") && maxTouchPoints > 1)
	);
}

export function installMethod(
	userAgent: string,
	hasPrompt: boolean,
	maxTouchPoints: number
): InstallMethod {
	if (isIosUserAgent(userAgent, maxTouchPoints)) return "none";
	if (hasPrompt) return "prompt";
	if (!userAgent.includes("Android")) return "none";
	if (userAgent.includes("SamsungBrowser/")) return "samsung";
	if (userAgent.includes("Firefox/")) return "firefox";
	const firesPrompt =
		userAgent.includes("EdgA/") ||
		(userAgent.includes("Chrome/") &&
			!/OPR\/|YaBrowser\/|UCBrowser\//.test(userAgent));
	return firesPrompt ? "none" : "other-android";
}
