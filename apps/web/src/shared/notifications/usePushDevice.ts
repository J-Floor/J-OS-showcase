import { type Accessor, createEffect, createSignal, untrack } from "solid-js";

import {
	disablePush,
	enablePush,
	pushConfigured,
	pushSubscribed,
	pushSupport,
	type PushSupport,
} from "../../lib/push.ts";
import { createActionError } from "../createActionError.ts";

/** This device's push state, shared by the drawer's device row (which shows
 *  and toggles it) and the Categories tab (which locks Push while it's off). */
export type PushDevice = {
	support: Accessor<PushSupport>;
	busy: Accessor<boolean>;
	error: Accessor<string | null>;
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
export function usePushDevice(isOpen: () => boolean): PushDevice {
	const [support, setSupport] = createSignal<PushSupport>(pushSupport());
	const [subscribed, setSubscribed] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const { error, trackResult, clear } = createActionError();

	createEffect(() => {
		if (!isOpen()) return;
		clear();
		setSupport(pushSupport());
		void pushSubscribed().then((result) => {
			if (!untrack(busy)) setSubscribed(result.unwrapOr(false));
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
		const result = await trackResult(enablePush());
		if (result.isOk()) {
			setSupport(result.value);
			setSubscribed(result.value === "granted");
		}
		setBusy(false);
	}

	async function disable(): Promise<void> {
		if (busy()) return;
		setBusy(true);
		await trackResult(disablePush());
		// The browser subscription is dropped even when the server call fails,
		// but not when reading it failed first: ask the browser, don't assume.
		// State unknown: leave it as it was.
		const stored = await pushSubscribed();
		if (stored.isOk()) setSubscribed(stored.value);
		setBusy(false);
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
