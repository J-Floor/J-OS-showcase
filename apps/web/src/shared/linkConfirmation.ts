import { useSearchParams } from "@solidjs/router";
import { createSignal, onMount, type Accessor } from "solid-js";

import { call } from "../lib/call.ts";

/** What a confirm page knows: "loading" until the call answers, "invalid" when
 *  the link or call failed, else the response's own status. */
export type LinkConfirmationStatus<Response extends { status: string }> =
	| "loading"
	| "invalid"
	| Response["status"];

/**
 * Confirms the emailed link's `?token=` with `confirm` on mount. `status` is
 * "loading" until the call answers, then the response's own status; a missing
 * token, or a call that throws, is "invalid" — the page never learns more than
 * "this link isn't valid". `response` holds the whole answer once there is one.
 */
export function createLinkConfirmation<Response extends { status: string }>(
	confirm: (args: { token: string }) => Promise<Response>
): {
	status: Accessor<LinkConfirmationStatus<Response>>;
	response: Accessor<Response | undefined>;
} {
	const [params] = useSearchParams();
	const [status, setStatus] =
		createSignal<LinkConfirmationStatus<Response>>("loading");
	const [response, setResponse] = createSignal<Response>();

	onMount(() => {
		void (async () => {
			const token = typeof params.token === "string" ? params.token : "";
			if (!token) {
				setStatus("invalid");
				return;
			}
			const result = await call(confirm({ token }), "invalid");
			if (result.isErr()) {
				setStatus("invalid");
				return;
			}
			setStatus(result.value.status);
			setResponse(() => result.value);
		})();
	});
	return { status, response };
}
