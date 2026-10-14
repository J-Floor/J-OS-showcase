import { useAction } from "convex-solidjs";
import { Match, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { createLinkConfirmation } from "../../shared/linkConfirmation.ts";

export function ConfirmApplication() {
	const confirm = useAction(api.applications.confirmApplication);
	const { status } = createLinkConfirmation((args) =>
		confirm.mutateAsync(args)
	);

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
