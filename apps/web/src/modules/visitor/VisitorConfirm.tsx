import { Button, Logo } from "@j-os/design-system";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import { createSignal, Match, onMount, Show, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Wifi } from "../../../convex/lib/wifi.ts";
import { WifiContent } from "../space/WifiContent.tsx";

import styles from "./ConfirmScreen.module.scss";

type Status =
	| "loading"
	| "verified"
	| "already"
	| "expired"
	| "invalid"
	| "ended";

type Who = { firstName: string; lastName: string; email: string };

/**
 * Public, unauthenticated `/visitor/confirm?token=<token>` page the confirm
 * link in the visitor email lands on: confirms the token via
 * `visitors.confirmVisitor` and, on success, shows the Wi-Fi. Dispatches no
 * lifecycle event — see `ConfirmApplication` for why that matters.
 */
export function VisitorConfirm() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const confirm = useAction(api.visitors.confirmVisitor);
	const [status, setStatus] = createSignal<Status>("loading");
	const [wifi, setWifi] = createSignal<Wifi | undefined>();
	const [who, setWho] = createSignal<Who | undefined>();

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
				setWho(res.who);
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
					<Match
						when={status() === "verified" || status() === "already"}
					>
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
							<Show when={who()} keyed>
								{(w) => (
									<Button
										onClick={() => {
											navigate("/sign-up", {
												state: {
													firstName: w.firstName,
													lastName: w.lastName,
													email: w.email,
												},
											});
										}}
									>
										Apply to J floor
									</Button>
								)}
							</Show>
						</div>
					</Match>
					<Match when={status() === "expired"}>
						<div class={styles.thanks}>
							<h1>This link has expired</h1>
							<p class={styles.intro}>
								Register again to get a fresh link.
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
