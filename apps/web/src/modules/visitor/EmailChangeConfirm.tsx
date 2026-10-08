import { Logo } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createSignal, Match, onMount, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { APP_NAME } from "../../lib/constants.ts";

import styles from "./ConfirmScreen.module.scss";

type Status =
	| "loading"
	| FunctionReturnType<typeof api.people.confirmEmailChange>["status"];

/**
 * Public, unauthenticated `/email/confirm?token=<token>` page the link in the
 * "confirm your new sign-in address" email lands on: confirms the token via
 * `people.confirmEmailChange`, which moves the person to the new address.
 */
export function EmailChangeConfirm() {
	const [params] = useSearchParams();
	const confirm = useMutation(api.people.confirmEmailChange);
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
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title={APP_NAME} />
				<Switch>
					<Match when={status() === "loading"}>
						<p class={styles.intro}>Confirming…</p>
					</Match>
					<Match when={status() === "verified"}>
						<div class={styles.thanks}>
							<h1>Your sign-in address is changed</h1>
							<p class={styles.intro}>
								From now on, sign in with this address.
							</p>
							<a href="/signin">Sign in →</a>
						</div>
					</Match>
					<Match when={status() === "taken"}>
						<div class={styles.thanks}>
							<h1>This address is already in use</h1>
							<p class={styles.intro}>
								Another person signs in with it now, so nothing
								changed. Ask the {APP_NAME} board for help.
							</p>
						</div>
					</Match>
					<Match when={status() === "expired"}>
						<div class={styles.thanks}>
							<h1>This link has expired</h1>
							<p class={styles.intro}>
								Nothing changed. Ask the {APP_NAME} board to
								send a new one.
							</p>
						</div>
					</Match>
					<Match when={status() === "invalid"}>
						<div class={styles.thanks}>
							<h1>This link isn't valid</h1>
						</div>
					</Match>
				</Switch>
			</div>
		</main>
	);
}
