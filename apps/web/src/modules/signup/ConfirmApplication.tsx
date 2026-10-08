import { useSearchParams } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import { createSignal, onMount, Match, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";

type Status = "loading" | "verified" | "already" | "expired" | "invalid";

export function ConfirmApplication() {
	const [params] = useSearchParams();
	const confirm = useAction(api.applications.confirmApplication);
	const [status, setStatus] = createSignal<Status>("loading");

	onMount(() => {
		void (async () => {
			const token = typeof params.token === "string" ? params.token : "";
			if (!token) {
				setStatus("invalid");
				return;
			}
			try {
				const res = await confirm.mutateAsync({ token });
				setStatus(res.status);
			} catch {
				setStatus("invalid");
			}
		})();
	});

	return (
		<main>
			<Switch>
				<Match when={status() === "loading"}>
					<p>Confirming your application…</p>
				</Match>
				<Match when={status() === "verified" || status() === "already"}>
					<h1>Application confirmed</h1>
					<p>Thanks for applying.</p>
				</Match>
				<Match when={status() === "expired"}>
					<h1>This link has expired</h1>
					<p>Re-submit the form to get a fresh confirmation link.</p>
				</Match>
				<Match when={status() === "invalid"}>
					<h1>This link isn't valid</h1>
					<p>Re-submit the form to get a new confirmation link.</p>
				</Match>
			</Switch>
		</main>
	);
}
