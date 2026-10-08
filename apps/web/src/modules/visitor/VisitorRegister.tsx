import { Button, Icon, Input, Logo } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { useAction, useMutation, useQuery } from "convex-solidjs";
import {
	createEffect,
	createMemo,
	createSignal,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { authClient } from "../../lib/auth.ts";
import { ICONS } from "../../shared/icons.ts";

import styles from "./VisitorRegister.module.scss";

// grecaptcha v3 is loaded by a <script> we inject on mount; type just what we call.
declare global {
	// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- global augmentation requires interface
	interface Window {
		grecaptcha?: {
			ready(cb: () => void): void;
			execute(siteKey: string, opts: { action: string }): Promise<string>;
		};
	}
}

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterOutcome = "pending" | "no-event" | "ended";

type View =
	| { kind: "missing-link" }
	| { kind: "loading" }
	| { kind: "not-found" }
	| { kind: "pending" }
	| { kind: "ended" }
	| { kind: "checked-in"; name: string }
	| { kind: "form"; name: string };

function checkedInName(v: View): string | null {
	return v.kind === "checked-in" ? v.name : null;
}

/**
 * Public `/visitor?event=<id>` page a scanned event QR code lands on.
 *
 * A signed-in, entitled member is checked in directly via
 * `eventCheckIn.checkInToEvent` — no form. Everyone else (signed-out, or a
 * signed-in-but-not-entitled visitor) sees the name/email form, gated by
 * invisible reCAPTCHA v3, which submits via `visitors.registerVisitor` (which
 * emails a confirm link — see `VisitorConfirm` for what happens next).
 */
export function VisitorRegister() {
	const [params] = useSearchParams();
	const register = useAction(api.visitors.registerVisitor);
	const checkIn = useMutation(api.eventCheckIn.checkInToEvent);
	const session = authClient.useSession();

	const eventIdParam = createMemo<string | null>(() => {
		const raw = params.event;
		return typeof raw === "string" && raw.trim() !== "" ? raw : null;
	});

	const event = useQuery(
		api.events.getEventPublic,
		() => ({ eventId: (eventIdParam() ?? "") as Id<"events"> }),
		() => ({ enabled: eventIdParam() !== null })
	);

	// Tracks the single async check-in attempt for a signed-in visitor: the
	// effect below fires the mutation once, while still "idle", and settles it
	// to "done" or "denied" so it never fires twice for the same page load.
	const [checkInStatus, setCheckInStatus] = createSignal<
		"idle" | "pending" | "done" | "denied"
	>("idle");

	createEffect(() => {
		const user = session().data?.user;
		const data = event.data();
		const id = eventIdParam();
		if (checkInStatus() !== "idle" || !user || !id || data == null) return;
		setCheckInStatus("pending");
		void checkIn
			.mutateAsync({ eventId: id as Id<"events"> })
			.then(() => setCheckInStatus("done"))
			.catch(() => setCheckInStatus("denied"));
	});

	const [firstName, setFirstName] = createSignal("");
	const [lastName, setLastName] = createSignal("");
	const [email, setEmail] = createSignal("");

	const [showErrors, setShowErrors] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	const [submitError, setSubmitError] = createSignal<string | null>(null);
	const [outcome, setOutcome] = createSignal<RegisterOutcome | null>(null);

	onMount(() => {
		if (!SITE_KEY) {
			// eslint-disable-next-line no-console -- dev hint for a missing required env var
			console.warn(
				"VITE_RECAPTCHA_SITE_KEY is not set — visitor captcha will fail"
			);
			return;
		}
		const src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
		if (document.querySelector(`script[src="${src}"]`)) return;
		const script = document.createElement("script");
		script.src = src;
		script.async = true;
		document.head.appendChild(script);

		// Remove the injected script + grecaptcha's floating badge so they don't
		// leak onto every other (authenticated) page after visiting /visitor.
		onCleanup(() => {
			script.remove();
			document.querySelector(".grecaptcha-badge")?.remove();
		});
	});

	const view = createMemo<View>(() => {
		const id = eventIdParam();
		if (!id) return { kind: "missing-link" };
		const data = event.data();
		if (data === undefined) return { kind: "loading" };
		if (data === null) return { kind: "not-found" };
		if (data.ended) return { kind: "ended" };

		// Session resolution is async (a /get-session fetch); until it settles
		// treat it like any other loading state rather than assuming signed-out
		// and flashing the form for a member who is actually signed in.
		if (session().isPending) return { kind: "loading" };

		const user = session().data?.user;
		if (user && checkInStatus() !== "denied") {
			return checkInStatus() === "done"
				? { kind: "checked-in", name: user.name }
				: { kind: "loading" };
		}

		const done = outcome();
		if (done === "pending") return { kind: "pending" };
		if (done === "no-event") return { kind: "not-found" };
		if (done === "ended") return { kind: "ended" };
		return { kind: "form", name: data.name };
	});

	const errors = createMemo(() => ({
		firstName: firstName().trim() === "" ? "Required." : null,
		lastName: lastName().trim() === "" ? "Required." : null,
		email:
			email().trim() === ""
				? "Required."
				: !EMAIL_RE.test(email().trim())
					? "Enter a valid email."
					: null,
	}));

	const isValid = createMemo(() => {
		const e = errors();
		return !e.firstName && !e.lastName && !e.email;
	});

	// Surface a field error only after a submit attempt.
	function err(field: string | null): string | undefined {
		return showErrors() && field ? field : undefined;
	}

	function errProps(field: string | null) {
		const text = err(field);
		return { invalid: Boolean(text), errorText: text };
	}

	async function onSubmit(submitEvent: Event) {
		submitEvent.preventDefault();
		if (submitting()) return;
		setSubmitError(null);
		setShowErrors(true);
		if (!isValid()) return;
		const id = eventIdParam();
		if (!id) return;

		setSubmitting(true);
		try {
			if (!SITE_KEY || !window.grecaptcha) {
				throw new Error("captcha-unavailable");
			}
			const token = await window.grecaptcha.execute(SITE_KEY, {
				action: "visitor",
			});
			const result = await register.mutateAsync({
				eventId: id as Id<"events">,
				firstName: firstName().trim(),
				lastName: lastName().trim(),
				email: email().trim(),
				token,
			});
			setOutcome(result.status);
		} catch {
			setSubmitError(
				"Something went wrong registering. Please try again."
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title="J floor" />
				<Switch>
					<Match when={view().kind === "missing-link"}>
						<div class={styles.thanks}>
							<h1>This link is missing its event</h1>
							<p class={styles.intro}>
								Scan the event QR code again to get a working
								link.
							</p>
						</div>
					</Match>
					<Match when={view().kind === "loading"}>
						<p class={styles.intro}>Loading…</p>
					</Match>
					<Match when={view().kind === "not-found"}>
						<div class={styles.thanks}>
							<h1>Event not found</h1>
							<p class={styles.intro}>
								This event link doesn't match a J floor event.
							</p>
						</div>
					</Match>
					<Match when={view().kind === "pending"}>
						<div class={styles.thanks}>
							<Icon class={styles.celebration}>
								{ICONS.registered}
							</Icon>
							<h1>Check your email</h1>
							<p class={styles.intro}>
								Check your email to confirm and get the Wi-Fi.
							</p>
						</div>
					</Match>
					<Match when={view().kind === "ended"}>
						<div class={styles.thanks}>
							<h1>This event has ended</h1>
						</div>
					</Match>
					<Match when={view().kind === "checked-in"}>
						<div class={styles.thanks}>
							<Icon class={styles.celebration}>
								{ICONS.registered}
							</Icon>
							<h1>You're checked in ✓</h1>
							<p class={styles.intro}>
								You're checked in as {checkedInName(view())}
								{" — get the Wi-Fi on the "}
								<a href="/space">space page</a>.
							</p>
						</div>
					</Match>
					<Match when={view().kind === "form"}>
						<div class={styles.heading}>
							<h1>Welcome to J floor</h1>
							<p class={styles.event}>{event.data()?.name}</p>
						</div>
						<p class={styles.intro}>
							Register with your name and email to get the Wi-Fi.
						</p>
						<form
							class={styles.form}
							onSubmit={(e) => void onSubmit(e)}
							noValidate
						>
							<div class={styles.row}>
								<Input
									label="First name"
									required
									disabled={submitting()}
									disabledReason="Registering…"
									value={firstName()}
									onValueChange={(e) =>
										setFirstName(e.currentTarget.value)
									}
									{...errProps(errors().firstName)}
								/>
								<Input
									label="Last name"
									required
									disabled={submitting()}
									disabledReason="Registering…"
									value={lastName()}
									onValueChange={(e) =>
										setLastName(e.currentTarget.value)
									}
									{...errProps(errors().lastName)}
								/>
							</div>

							<Input
								type="email"
								label="Email"
								placeholder="you@example.com"
								leadingIconName={ICONS.email}
								autocomplete="email"
								required
								disabled={submitting()}
								disabledReason="Registering…"
								value={email()}
								onValueChange={(e) =>
									setEmail(e.currentTarget.value)
								}
								{...errProps(errors().email)}
							/>

							<Show when={submitError()}>
								<div class={styles.banner} role="alert">
									<Icon>{ICONS.error}</Icon>
									<span>{submitError()}</span>
								</div>
							</Show>

							<Button
								type="submit"
								class={styles.submit}
								isLoading={submitting()}
							>
								Register
							</Button>
						</form>
					</Match>
				</Switch>
			</div>
		</main>
	);
}
