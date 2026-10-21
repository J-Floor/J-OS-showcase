import { Button, Icon, Input, Logo } from "@j-os/design-system";
import { Navigate, useNavigate } from "@solidjs/router";
import { ResultAsync } from "neverthrow";
import { createEffect, createSignal, on, Show } from "solid-js";

import { authClient } from "../../lib/auth.ts";
import { ottFailed, ottPending } from "../../lib/convex.ts";
import { ICONS } from "../../shared/icons.ts";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./SignIn.module.scss";

const OTT_FAILED = "That sign-in link didn't work. Send a new one.";
const SEND_FAILED = "Couldn’t send the link. Try again.";

/** Requests the magic link for `email()`, tracking whether it was sent, is
 *  sending, or failed. */
function createMagicLinkRequest(email: () => string) {
	const [sent, setSent] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [sending, setSending] = createSignal(false);

	async function submit(event: Event) {
		event.preventDefault();
		if (sending()) return;
		setError(null);
		setSending(true);
		const response = await ResultAsync.fromPromise(
			authClient.signIn.magicLink({
				email: email(),
				callbackURL: "/",
			}),
			() => SEND_FAILED
		);
		setSending(false);
		if (response.isErr()) {
			setError(response.error);
			return;
		}
		if (response.value.error)
			setError(response.value.error.message ?? SEND_FAILED);
		else setSent(true);
	}

	return { sent, setSent, error, setError, sending, submit };
}

function LinkSentPanel(props: { email: string; onReset: () => void }) {
	return (
		<div class={styles.confirmation}>
			<h1>Check your inbox</h1>
			<p class={styles.subtitle}>
				If <strong>{props.email}</strong> has access, a sign-in link is
				on its way.
			</p>
			<Button variant="tertiary" onClick={props.onReset}>
				<Icon>{ICONS.back}</Icon>Use a different email
			</Button>
		</div>
	);
}

/**
 * Magic-link sign-in. Enter an email → a secure link is sent (delivery is
 * stubbed to the Convex logs in dev). Password/passkey are a later increment.
 */
export function SignIn() {
	const session = authClient.useSession();
	const [email, setEmail] = createSignal("");
	const { sent, setSent, error, setError, sending, submit } =
		createMagicLinkRequest(email);
	const navigate = useNavigate();
	// A failed link exchange is the form's own error from the moment the
	// exchange ends, so sending a new link (or starting over) clears it.
	createEffect(
		on(ottPending, (isPending) => {
			if (!isPending && ottFailed()) setError(OTT_FAILED);
		})
	);

	// /signin lives outside the RoleGate subtree (that gate only pushes signed-OUT
	// users TO /signin). Mirror its opposite case here: once the session resolves,
	// an already-signed-in user is bounced to `/` (which then lands them on their
	// last route) instead of being stranded on the sign-in screen.
	return (
		<Show
			when={!session().isPending && !ottPending()}
			fallback={<LoadingScreen />}
		>
			<Show when={!session().data} fallback={<Navigate href="/" />}>
				<main class={styles.screen}>
					<div class={styles.card}>
						<Logo class={styles.logo} title="J floor" />
						<Show
							when={!sent()}
							fallback={
								<LinkSentPanel
									email={email()}
									onReset={() => {
										setSent(false);
										setError(null);
									}}
								/>
							}
						>
							<h1>Sign in to J floor</h1>
							<form
								class={styles.form}
								onSubmit={(event) => void submit(event)}
								noValidate
							>
								<Input
									type="email"
									label="Email"
									placeholder="you@example.com"
									leadingIconName={ICONS.email}
									autocomplete="email"
									required
									value={email()}
									onValueChange={(event) =>
										setEmail(event.currentTarget.value)
									}
									invalid={Boolean(error())}
									errorText={error() ?? undefined}
								/>
								<Button
									type="submit"
									class={styles.submit}
									isLoading={sending()}
								>
									<Icon>{ICONS.email}</Icon>Email me a sign-in
									link
								</Button>
								<Button
									variant="tertiary"
									class={styles.apply}
									onClick={() => {
										navigate("/sign-up");
									}}
								>
									Not a member yet? Apply
								</Button>
							</form>
						</Show>
					</div>
				</main>
			</Show>
		</Show>
	);
}
