import { type Accessor, createEffect, createSignal, untrack } from "solid-js";

import {
	disablePush,
	enablePush,
	isServiceWorkerNotReady,
	pushConfigured,
	pushSubscribed,
	pushSupport,
	type PushSupport,
} from "../../lib/push.ts";
import { userErrorMessage } from "../userErrorMessage.ts";

/** This device's push state, shared by the drawer's device row (which shows
 *  and toggles it) and the Categories tab (which locks Push while it's off). */
export type PushDevice = {
	support: Accessor<PushSupport>;
	busy: Accessor<boolean>;
	error: Accessor<string | undefined>;
	pushOn: () => boolean;
	configured: () => boolean;
	canToggle: () => boolean;
	enable: () => Promise<void>;
	disable: () => Promise<void>;
};

/**
 * Reads and toggles this device's push subscription. The drawer stays
 * mounted for the whole shell, so the state is re-read on every open: push
 * may have been enabled elsewhere (the prompt pill).
 */
export function usePushDevice(open: () => boolean): PushDevice {
	const [support, setSupport] = createSignal<PushSupport>(pushSupport());
	const [subscribed, setSubscribed] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal<string>();

	createEffect(() => {
		if (!open()) return;
		setError(undefined);
		setSupport(pushSupport());
		pushSubscribed()
			.then((value) => {
				if (!untrack(busy)) setSubscribed(value);
			})
			.catch(() => {
				if (!untrack(busy)) setSubscribed(false);
			});
	});

	function pushOn(): boolean {
		return pushConfigured() && support() === "granted" && subscribed();
	}

	function canToggle(): boolean {
		return (
			pushConfigured() &&
			(support() === "default" || support() === "granted")
		);
	}

	async function enable(): Promise<void> {
		if (busy()) return;
		setBusy(true);
		setError(undefined);
		try {
			const next = await enablePush();
			setSupport(next);
			setSubscribed(next === "granted");
		} catch (err) {
			setError(
				isServiceWorkerNotReady(err)
					? "The app is still starting up. Try again in a moment."
					: userErrorMessage(err, "Could not turn on notifications.")
			);
		} finally {
			setBusy(false);
		}
	}

	async function disable(): Promise<void> {
		if (busy()) return;
		setBusy(true);
		setError(undefined);
		try {
			await disablePush();
		} catch (err) {
			setError(
				userErrorMessage(err, "Could not turn off notifications.")
			);
		} finally {
			// The browser subscription is dropped even when the server call fails,
			// but not when reading it failed first: ask the browser, don't assume.
			try {
				setSubscribed(await pushSubscribed());
			} catch {
				// State unknown: leave it as it was.
			}
			setBusy(false);
		}
	}

	return {
		support,
		busy,
		error,
		pushOn,
		configured: pushConfigured,
		canToggle,
		enable,
		disable,
	};
}
