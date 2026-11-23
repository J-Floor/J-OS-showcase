import { Button, Icon, Input } from "@j-os/design-system";
import { A, useSearchParams } from "@solidjs/router";
import { useMutation } from "convex-solidjs";
import { createSignal, Show, type JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { tvMessages } from "../../../convex/lib/errors/tv.ts";
import { Can } from "../../lib/ability.tsx";
import { call } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./TvPairPage.module.scss";

const DEFAULT_LABEL = "Space TV";
const CHECK_CODE_LENGTH = 4;
const APPROVE_FAILED = "Couldn’t pair the TV. Try again.";

type PairingStatus = "pending" | "expired" | "used" | "unknown";

/** What the card says for each way a code can fail to be pending. */
const REFUSALS: Record<Exclude<PairingStatus, "pending">, string> = {
	expired: tvMessages.TvPairingExpired,
	used: tvMessages.TvPairingUsed,
	unknown: tvMessages.TvPairingInvalid,
};

function Screen(props: { children: JSX.Element }): JSX.Element {
	return (
		<main class={styles.screen}>
			<div class={styles.card}>{props.children}</div>
		</main>
	);
}

/** The pending code's form: shows the short check code to compare with the TV. */
function ConfirmForm(props: { code: string; onPaired: () => void }) {
	// The TV shows the same four characters, uppercased (a code, not prose).
	function checkCode(): string {
		// eslint-disable-next-line no-restricted-syntax -- comparing codes, not UI text
		return props.code.slice(0, CHECK_CODE_LENGTH).toUpperCase();
	}
	const approve = useMutation(api.tv.approvePairing);
	const [label, setLabel] = createSignal(DEFAULT_LABEL);
	const [error, setError] = createSignal<string>();
	const [sending, setSending] = createSignal(false);

	async function submit(event: Event) {
		event.preventDefault();
		if (sending() || label().trim() === "") return;
		setError(undefined);
		setSending(true);
		const result = await call(
			approve.mutateAsync({ code: props.code, label: label().trim() }),
			APPROVE_FAILED
		);
		setSending(false);
		result.match(props.onPaired, (failure) => setError(failure.message));
	}

	return (
		<form class={styles.form} onSubmit={(event) => void submit(event)}>
			<h1>Pair this TV</h1>
			<p class={styles.intro}>Check that the TV shows this code.</p>
			<p class={styles.checkCode} aria-label="Check code">
				{checkCode()}
			</p>
			<Input
				label="Name"
				value={label()}
				onValueChange={(event) => setLabel(event.currentTarget.value)}
			/>
			<InlineError message={error()} />
			<Button
				type="submit"
				isLoading={sending()}
				disabled={label().trim() === ""}
				disabledReason="Give the TV a name."
			>
				<Icon>{ICONS.stepDone}</Icon>Confirm
			</Button>
		</form>
	);
}

function Pairing(props: { code: string }) {
	const status = useQuery(api.tv.pairingStatus, () => ({ code: props.code }));
	const [paired, setPaired] = createSignal(false);
	return (
		<Show
			when={!paired()}
			fallback={
				<Screen>
					<div class={styles.done}>
						<h1>TV paired</h1>
						<A href="/space?tab=tv">Back to Space</A>
					</div>
				</Screen>
			}
		>
			<Show when={status.data()} fallback={<LoadingScreen />} keyed>
				{(current) => (
					<Screen>
						<Show
							when={current !== "pending" && current}
							fallback={
								<ConfirmForm
									code={props.code}
									onPaired={() => setPaired(true)}
								/>
							}
						>
							{(refused) => (
								<p class={styles.intro}>
									{REFUSALS[refused()]}
								</p>
							)}
						</Show>
					</Screen>
				)}
			</Show>
		</Show>
	);
}

/** `/tv/pair?code=...`: the page the TV's QR code opens, where a board member
 *  confirms the pairing. Everyone else gets `noAccess` (and no query); the
 *  app layer passes it in because a module may not import the shell. */
export function TvPairRoute(props: { noAccess: JSX.Element }) {
	const [params] = useSearchParams();
	return (
		<Can I="manage" the="Space" fallback={props.noAccess}>
			<Show
				when={typeof params.code === "string" && params.code}
				fallback={
					<Screen>
						<p class={styles.intro}>
							{tvMessages.TvPairingInvalid}
						</p>
					</Screen>
				}
				keyed
			>
				{(code) => <Pairing code={code} />}
			</Show>
		</Can>
	);
}
