import { createSignal } from "solid-js";

/** Minimal shape of `document` this module needs: enough to listen for
 * visibility changes and read the current state. A real `EventTarget` (or
 * `document` itself) satisfies this without jsdom. */
export type PwaUpdatesDocument = Pick<
	EventTarget,
	"addEventListener" | "removeEventListener"
> & {
	visibilityState: DocumentVisibilityState;
};

export type StartPwaUpdateChecksDeps = {
	doc?: PwaUpdatesDocument;
	isOnline?: () => boolean;
};

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let checkNow: (() => void) | undefined;

/**
 * Checks for a new build right away, on the registration that
 * {@link startPwaUpdateChecks} received. The error boundaries call it: a
 * stale bundle calling a renamed Convex function only sees "Server Error",
 * and a new build, if one is waiting, reloads the page through
 * {@link startReloadOnUpdate}.
 */
export function checkForUpdateNow(): void {
	checkNow?.();
}

/**
 * Keeps a registered service worker's update check alive for as long as the
 * PWA stays open. `vite-plugin-pwa` (with `registerType: 'autoUpdate'`) only
 * checks `sw.js` for a new version on navigation or every ~24h, which on an
 * installed phone PWA that stays open for days means a deploy can take that
 * long to reach the user. This triggers `registration.update()`:
 * - whenever the page becomes visible again (foregrounding the app), and
 * - on a 60-minute interval while it stays open.
 * An update is skipped while offline (`navigator.onLine` is false), since a
 * failed fetch would only log noise.
 *
 * Returns a cleanup function that removes the listener and clears the
 * interval.
 */
export function startPwaUpdateChecks(
	registration: ServiceWorkerRegistration | undefined,
	deps: StartPwaUpdateChecksDeps = {}
): () => void {
	const { doc = document, isOnline = () => navigator.onLine } = deps;

	if (!registration) {
		checkNow = undefined;
		return () => {};
	}
	// Re-bound so nested function declarations (hoisted, so TS won't narrow the
	// captured parameter itself) see the non-undefined type.
	const sw = registration;

	function checkForUpdate(): void {
		if (!isOnline()) return;
		void sw.update().catch(() => {
			// A failed check (offline race, SW unregistered mid-flight) is not
			// actionable here; the next trigger tries again.
		});
	}

	checkNow = checkForUpdate;

	function onVisibilityChange(): void {
		if (doc.visibilityState === "visible") checkForUpdate();
	}

	doc.addEventListener("visibilitychange", onVisibilityChange);
	const intervalId = setInterval(checkForUpdate, CHECK_INTERVAL_MS);

	return function cleanup(): void {
		doc.removeEventListener("visibilitychange", onVisibilityChange);
		clearInterval(intervalId);
		checkNow = undefined;
	};
}

export const UPDATE_OVERLAY_TIMEOUT_MS = 20_000;

const [updating, setUpdating] = createSignal(false);

/** True while a new build installs over the running one, until the reload
 * replaces the page (or the timeout gives up). Drives `UpdatingOverlay`. */
export const isUpdating = updating;

/** Test-only: force the signal, since it is a module-level singleton. */
export function setUpdatingForTest(value: boolean): void {
	setUpdating(value);
}

/** The slice of `navigator.serviceWorker` this module needs. */
export type ServiceWorkerContainerLike = Pick<
	EventTarget,
	"addEventListener"
> & {
	controller: unknown;
};

export type ReloadOnUpdateDeps = {
	/** `null` means no service-worker support. */
	container?: ServiceWorkerContainerLike | null;
	reload?: () => void;
};

function defaultContainer(): ServiceWorkerContainerLike | null {
	return typeof navigator !== "undefined" && "serviceWorker" in navigator
		? navigator.serviceWorker
		: null;
}

/**
 * Reloads the page onto a new build, and flags the update for the overlay.
 * Call at module load, before `registerSW`, so `controller` still reflects
 * the worker that served this page.
 *
 * workbox-window (behind `registerSW`) reloads only on its `activated` event,
 * which it never sends when the browser's navigation update check started
 * installing the new worker before `register()` ran: the common "open the
 * app after a deploy" case. So this listens for `controllerchange` directly
 * and reloads once. A first install (no controller at load) also fires
 * `controllerchange` through `clientsClaim`, and must not reload.
 *
 * Returns a function to call with the registration once it exists: it shows
 * the overlay for a worker already installing, and for any later
 * `updatefound`.
 */
export function startReloadOnUpdate(
	deps: ReloadOnUpdateDeps = {}
): (registration: ServiceWorkerRegistration | undefined) => void {
	const container =
		deps.container === undefined ? defaultContainer() : deps.container;
	const reload =
		deps.reload ??
		(() => {
			window.location.reload();
		});

	if (!container?.controller) {
		return () => {};
	}

	let reloaded = false;
	container.addEventListener("controllerchange", () => {
		if (reloaded) return;
		reloaded = true;
		reload();
	});

	let hideTimer: ReturnType<typeof setTimeout> | undefined;
	function showUpdating(): void {
		setUpdating(true);
		clearTimeout(hideTimer);
		hideTimer = setTimeout(
			() => setUpdating(false),
			UPDATE_OVERLAY_TIMEOUT_MS
		);
	}

	return function watchRegistration(registration): void {
		if (!registration) return;
		if (registration.installing) showUpdating();
		registration.addEventListener("updatefound", showUpdating);
	};
}
