import { Logo } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Wifi } from "../../../convex/lib/wifi.ts";
import { WifiContent } from "../space/WifiContent.tsx";

import styles from "./ConfirmScreen.module.scss";

type Status = "loading" | "verified" | "expired" | "invalid" | "ended";

/**
 * Public, unauthenticated `/event/confirm?token=<token>` page the confirm
 * link in the event-invite email lands on: confirms the token via
 * `eventCheckIn.confirmEventInvite` and, on success, shows the Wi-Fi. Unlike
 * `VisitorConfirm`, this is for a non-visitor (e.g. an existing J floor
 * member) checking into an event, so it always offers a way back into the
 * authed app.
 */
export function EventInviteConfirm() {
	const [params] = useSearchParams();
	const confirm = useAction(api.eventCheckIn.confirmEventInvite);
	const [status, setStatus] = createSignal<Status>("loading");
	const [wifi, setWifi] = createSignal<Wifi | undefined>();

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
				setWifi(res.wifi);
			} catch {
				setStatus("invalid");
			}
		})();
	});

	return (
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title="J floor" />
				<Switch>
					<Match when={status() === "loading"}>
						<p class={styles.intro}>Confirming…</p>
					</Match>
					<Match when={status() === "verified"}>
						<div class={styles.thanks}>
							<h1>You're in — here's the Wi-Fi</h1>
							<Show when={wifi()} keyed>
								{(w) => (
									<WifiContent
										ssid={w.ssid}
										password={w.password}
									/>
								)}
							</Show>
							<a href="/space">
								Have a J floor account? Open the space page →
							</a>
						</div>
					</Match>
					<Match when={status() === "expired"}>
						<div class={styles.thanks}>
							<h1>This link has expired</h1>
							<p class={styles.intro}>
								Ask for a fresh invite to get in.
							</p>
						</div>
					</Match>
					<Match when={status() === "ended"}>
						<div class={styles.thanks}>
							<h1>This event has ended</h1>
							<p class={styles.intro}>
								This event has ended — the Wi-Fi link is no
								longer active.
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
