import { useSearchParams } from "@solidjs/router";
import { createSignal, onMount, type Accessor } from "solid-js";

import { call } from "../lib/call.ts";

/**
 * Confirms the emailed link's `?token=` with `confirm` on mount. `status` is
 * "loading" until the call answers, then the response's own status; a missing
 * token, or a call that throws, is "invalid" — the page never learns more than
 * "this link isn't valid". `response` holds the whole answer once there is one.
 */
export function createLinkConfirmation<Response extends { status: string }>(
	confirm: (args: { token: string }) => Promise<Response>
): {
	status: Accessor<"loading" | "invalid" | Response["status"]>;
	response: Accessor<Response | undefined>;
} {
	const [params] = useSearchParams();
	const [status, setStatus] = createSignal<
		"loading" | "invalid" | Response["status"]
	>("loading");
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
