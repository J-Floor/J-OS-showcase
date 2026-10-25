import { Logo } from "@j-os/design-system";
import type { FunctionReturnType } from "convex/server";
import { Match, Show, Switch, type JSX } from "solid-js";

import type { api } from "../../../convex/_generated/api";
import type { Wifi } from "../../../convex/lib/wifi.ts";
import { APP_NAME } from "../../lib/constants.ts";
import type { LinkConfirmationStatus } from "../../shared/linkConfirmation.ts";
import { WifiContent } from "../space/WifiContent.tsx";

import styles from "./ConfirmScreen.module.scss";

/** The branded card an emailed confirm link lands on. */
export function ConfirmScreen(props: { children: JSX.Element }): JSX.Element {
	return (
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title={APP_NAME} />
				{props.children}
			</div>
		</main>
	);
}

/** What the card says while the token is being checked. */
export function ConfirmingLine(): JSX.Element {
	return <p class={styles.intro}>Confirming…</p>;
}

/** One outcome of the confirmation: its headline, then any detail. */
export function ConfirmOutcome(props: {
	title: string;
	children?: JSX.Element;
}): JSX.Element {
	return (
		<div class={styles.thanks}>
			<h1>{props.title}</h1>
			{props.children}
		</div>
	);
}

/** An outcome's explanatory line under its headline. */
export function ConfirmDetail(props: { children: JSX.Element }): JSX.Element {
	return <p class={styles.intro}>{props.children}</p>;
}

/** The statuses of the two Wi-Fi confirm links, plus the page's own two. */
type WifiConfirmStatus = LinkConfirmationStatus<
	| FunctionReturnType<typeof api.visitors.confirmVisitor>
	| FunctionReturnType<typeof api.eventCheckIn.confirmEventInvite>
>;

/**
 * The Wi-Fi hand-off a visitor or event-invite link lands on. Once verified it
 * shows the Wi-Fi, then `children` (where to go next); `expiredDetail` says how
 * to get a fresh link.
 */
export function WifiConfirmScreen(props: {
	status: WifiConfirmStatus;
	isVerified: boolean;
	wifi: Wifi | undefined;
	expiredDetail: string;
	children: JSX.Element;
}): JSX.Element {
	return (
		<ConfirmScreen>
			<Switch>
				<Match when={props.status === "loading"}>
					<ConfirmingLine />
				</Match>
				<Match when={props.isVerified}>
					<ConfirmOutcome title="You're in — here's the Wi-Fi">
						<Show when={props.wifi} keyed>
							{(wifi) => (
								<WifiContent
									ssid={wifi.ssid}
									password={wifi.password}
								/>
							)}
						</Show>
						{props.children}
					</ConfirmOutcome>
				</Match>
				<Match when={props.status === "expired"}>
					<ConfirmOutcome title="This link has expired">
						<ConfirmDetail>{props.expiredDetail}</ConfirmDetail>
					</ConfirmOutcome>
				</Match>
				<Match when={props.status === "ended"}>
					<ConfirmOutcome title="This event has ended">
						<ConfirmDetail>
							This event has ended — the Wi-Fi link is no longer
							active.
						</ConfirmDetail>
					</ConfirmOutcome>
				</Match>
				<Match when={props.status === "invalid"}>
					<ConfirmOutcome title="This link isn't valid" />
				</Match>
			</Switch>
		</ConfirmScreen>
	);
}
