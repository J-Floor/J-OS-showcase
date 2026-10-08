import { useConvexClient } from "convex-solidjs";
import { createSignal, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Open a person's signed agreement in a new tab.
 *
 * The URL is fetched on demand rather than subscribed per row: it used to be a
 * `useQuery` on every roster row, so the server minted a signed storage URL for
 * each of several hundred people before the board had clicked anything.
 *
 * The blank tab is opened SYNCHRONOUSLY, inside the click handler, and pointed
 * at the URL once it arrives. A `window.open` after an `await` is a popup as far
 * as the browser is concerned, and gets blocked.
 *
 * That open must NOT pass `noopener`. `window.open` returns null whenever
 * `noopener` is set — withholding the handle is the entire point of the flag —
 * so the tab opened, the handle came back null, the code read that as "popup
 * blocked" and sent the CURRENT tab to the document, leaving the new one
 * stranded on about:blank. The opener link is severed by hand instead, which
 * buys the same protection while leaving something to navigate.
 */
export function useOpenAgreement(): {
	open: (personId: Id<"people">) => void;
	loading: Accessor<boolean>;
} {
	const client = useConvexClient();
	const [loading, setLoading] = createSignal(false);

	function open(personId: Id<"people">): void {
		const convex = client;
		if (!convex) return;
		const tab = window.open("", "_blank");
		// What `noopener` would have done, without losing the handle.
		if (tab) tab.opener = null;
		setLoading(true);
		void convex
			.query(api.people.getAgreementUrl, { personId })
			.then((url) => {
				if (url === null) {
					tab?.close();
					return;
				}
				if (tab) tab.location.href = url;
				// A blocked popup is not a reason to lose the document: fall
				// back to navigating this tab, which is a user-initiated
				// navigation and always allowed.
				else window.location.href = url;
			})
			.finally(() => {
				setLoading(false);
			});
	}

	return { open, loading };
}
