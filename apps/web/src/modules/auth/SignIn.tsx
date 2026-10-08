import { Button, Icon, Input, Logo } from "@j-os/design-system";
import { Navigate, useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";

import { authClient } from "../../lib/auth.ts";
import { ottPending } from "../../lib/convex.ts";
import { ICONS } from "../../shared/icons.ts";
import { LoadingScreen } from "../../shared/LoadingScreen.tsx";

import styles from "./SignIn.module.scss";

/**
 * Magic-link sign-in. Enter an email → a secure link is sent (delivery is
 * stubbed to the Convex logs in dev). Password/passkey are a later increment.
 */
export function SignIn() {
	const session = authClient.useSession();
	const [email, setEmail] = createSignal("");
	const [sent, setSent] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);
	const [sending, setSending] = createSignal(false);
	const navigate = useNavigate();

	async function submit(event: Event) {
		event.preventDefault();
		if (sending()) return;
		setError(null);
		setSending(true);
		try {
			const res = await authClient.signIn.magicLink({
				email: email(),
				callbackURL: "/",
			});
			if (res.error)
				setError(
					res.error.message ?? "Couldn’t send the link. Try again."
				);
			else setSent(true);
		} catch {
			setError("Couldn’t send the link. Try again.");
		} finally {
			setSending(false);
		}
	}

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
								<div class={styles.confirmation}>
									<h1>Check your inbox</h1>
									<p class={styles.subtitle}>
										If <strong>{email()}</strong> has
										access, a sign-in link is on its way.
									</p>
									<Button
										variant="tertiary"
										onClick={() => {
											setSent(false);
											setError(null);
										}}
									>
										<Icon>{ICONS.back}</Icon>Use a different
										email
									</Button>
								</div>
							}
						>
							<h1>Sign in to J floor</h1>
							<form
								class={styles.form}
								onSubmit={(e) => void submit(e)}
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
									onValueChange={(e) =>
										setEmail(e.currentTarget.value)
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
