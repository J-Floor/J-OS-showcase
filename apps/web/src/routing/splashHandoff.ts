import { unfoldLogo } from "@j-os/design-system";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	on,
	untrack,
} from "solid-js";

import { isUpdating } from "../lib/pwaUpdates.ts";
import {
	BRAND_FRAME,
	BRAND_SCREEN,
} from "../shared/components/Sidebar/brandFrame.ts";

function sidebarRail(): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[${BRAND_FRAME}]`);
}

function appScreen(): HTMLElement | null {
	return document.querySelector<HTMLElement>(`[${BRAND_SCREEN}]`);
}

/**
 * The boot gate's swap from the splash to the shell. The shell follows
 * `showSplash` through its own signal, so the swap can run inside a View
 * Transition: the splash logo unfolds into the sidebar, or on a phone its
 * frame grows into the screen (`unfoldLogo`). The
 * swap happens exactly when it did before; the transition only wraps it.
 *
 * `landsOnRail` says whether the shell about to show has the sidebar (a
 * signed-in user past onboarding, with access). Without it, or while the app
 * is updating (its overlay covers everything), the swap is instant: there is
 * nothing for the logo to land on.
 */
export function createSplashHandoff(
	showSplash: Accessor<boolean>,
	landsOnRail: Accessor<boolean>
): {
	isShellShown: Accessor<boolean>;
	splashRef: (element: HTMLElement) => void;
} {
	const isSplashWanted = createMemo(showSplash);
	const [isShellShown, setShellShown] = createSignal(
		untrack(() => !isSplashWanted())
	);
	let splash: HTMLElement | undefined;
	function flip(): void {
		// The update runs a frame later; the splash may be wanted again.
		if (!untrack(isSplashWanted)) setShellShown(true);
	}
	createEffect(
		on(isSplashWanted, (isWanted) => {
			if (isWanted) {
				setShellShown(false);
				return;
			}
			if (untrack(isShellShown)) return;
			if (!untrack(landsOnRail) || untrack(isUpdating)) {
				flip();
				return;
			}
			void unfoldLogo({
				logo: splash,
				landing: sidebarRail,
				screen: appScreen,
				flip,
			});
		})
	);
	return {
		isShellShown,
		splashRef: (element) => {
			splash = element;
		},
	};
}
