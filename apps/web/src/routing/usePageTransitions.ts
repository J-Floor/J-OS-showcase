import { canAnimate, viewTransition } from "@j-os/design-system";
import {
	type BeforeLeaveEventArgs,
	useBeforeLeave,
	useLocation,
} from "@solidjs/router";
import { createEffect, on } from "solid-js";

import "./pageTransition.scss";

/**
 * Route changes as a View Transition of the content region (`app-page`,
 * styled in pageTransition.scss). The sidebar and topbar stay still: the
 * document root is not captured.
 *
 * Only a PATHNAME change animates; a search-param change (a sheet deep link,
 * a tab param) is not a page change.
 *
 * The router has no transition hook, so this cancels the navigation and
 * replays it (`retry`) inside the transition. Back/Forward arrive as a history
 * delta; the browser is already at the target URL then, so the target path is
 * read from `window.location`. Without the API or under reduced motion this
 * does nothing and navigation runs as before.
 *
 * A Back/Forward replay is a history.go(), whose popstate arrives later, after
 * isReplaying is reset; shouldSkipDelta lets exactly that one delta through,
 * however late it comes. Only the commit or that delta clears it: the update
 * has no timer of its own, the coordinator already caps the wait.
 *
 * The replay is not forced: other leave listeners (guards) run again and may
 * still block it. This hook's own listener steps aside while isReplaying.
 * So every guard runs TWICE per animated navigation: first in the round this
 * hook cancels (it sees `defaultPrevented: true`), then in the replay. A
 * guard must honour `defaultPrevented` and do nothing in the first round.
 */
const INDEX_PATH = "/";

/**
 * A redirect is not a page change the person asked for: a `replace`
 * navigation (`<Navigate>`), or leaving the index route, which only
 * redirects. At boot it runs while the splash unfolds into the sidebar, and
 * a page transition then would cut that one short.
 */
function isRedirect(event: BeforeLeaveEventArgs): boolean {
	return (
		event.options?.replace === true || event.from.pathname === INDEX_PATH
	);
}

export function usePageTransitions(page: () => HTMLElement | undefined): void {
	const location = useLocation();
	let committed: (() => void) | undefined;
	let target: string | undefined;
	let isReplaying = false;
	let shouldSkipDelta = false;

	createEffect(
		on(
			() => location.pathname,
			(pathname) => {
				if (pathname === target) committed?.();
			}
		)
	);

	useBeforeLeave((event) => {
		if (shouldSkipDelta && typeof event.to === "number") {
			shouldSkipDelta = false;
			return;
		}
		if (
			isReplaying ||
			event.defaultPrevented ||
			!canAnimate() ||
			isRedirect(event)
		)
			return;
		const element = page();
		if (!element) return;
		const to =
			typeof event.to === "number"
				? window.location.pathname
				: new URL(event.to, window.location.href).pathname;
		if (to === event.from.pathname) return;
		event.preventDefault();
		target = to;
		void viewTransition(
			() =>
				new Promise<void>((resolve) => {
					committed = () => {
						shouldSkipDelta = false;
						resolve();
					};
					if (location.pathname === target) {
						resolve();
						return;
					}
					isReplaying = true;
					shouldSkipDelta = typeof event.to === "number";
					try {
						event.retry();
					} finally {
						isReplaying = false;
					}
				}),
			{ kind: "app-page", names: [[element, "app-page"]] }
		);
	});
}
