import { Button, Icon, Input, Logo } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import type { FunctionReturnType } from "convex/server";
import { useAction, useMutation } from "convex-solidjs";
import {
	createEffect,
	createMemo,
	createSignal,
	Match,
	Switch,
	type Accessor,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { authClient } from "../../lib/auth.ts";
import { call } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { createFieldErrors } from "../../shared/fieldErrors.ts";
import { ICONS } from "../../shared/icons.ts";
import { emailError } from "../../shared/isValidEmail.ts";
import { NameFields } from "../../shared/NameFields.tsx";
import { useRecaptchaScript } from "../../shared/recaptcha.ts";
import { SubmitErrorBanner } from "../../shared/SubmitErrorBanner.tsx";
import { PrivacyNoticeLine } from "../privacy/PrivacyNoticeLine.tsx";
import { getCaptchaToken } from "../signup/captchaToken.ts";

import styles from "./VisitorRegister.module.scss";

const REGISTER_FAILED = "Something went wrong registering. Please try again.";

export type RegisterOutcome = FunctionReturnType<
	typeof api.visitors.registerVisitor
>["status"];

type CheckInStatus = "idle" | "pending" | "done" | "denied";

type View =
	| { kind: "missing-link" }
	| { kind: "loading" }
	| { kind: "not-found" }
	| { kind: "pending" }
	| { kind: "ended" }
	| { kind: "checked-in"; name: string }
	| { kind: "form"; name: string };

type PublicEvent = FunctionReturnType<typeof api.events.getEventPublic>;
type EventQuery = Pick<
	ReturnType<typeof useQuery<typeof api.events.getEventPublic>>,
	"data"
>;
type Session = ReturnType<typeof authClient.useSession>;

function checkedInName(view: View): string | null {
	return view.kind === "checked-in" ? view.name : null;
}

/**
 * Tracks the single async check-in attempt for a signed-in visitor: the
 * effect fires the mutation once, while still "idle", and settles it to
 * "done" or "denied" so it never fires twice for the same page load.
 */
function createCheckInStatus(options: {
	session: Session;
	event: EventQuery;
	eventId: Accessor<string | null>;
}): Accessor<CheckInStatus> {
	const checkIn = useMutation(api.eventCheckIn.checkInToEvent);
	const [checkInStatus, setCheckInStatus] =
		createSignal<CheckInStatus>("idle");

	createEffect(() => {
		const user = options.session().data?.user;
		const data = options.event.data();
		const id = options.eventId();
		if (
			checkInStatus() !== "idle" ||
			!user ||
			!id ||
			data === null ||
			data === undefined
		)
			return;
		setCheckInStatus("pending");
		// A refusal drops the visitor back onto the registration form, which is
		// where they would have registered anyway.
		void call(
			checkIn.mutateAsync({ eventId: id as Id<"events"> }),
			"Could not check you in."
		).then((result) => {
			setCheckInStatus(result.isOk() ? "done" : "denied");
		});
	});
	return checkInStatus;
}

/** What the page shows, from the link, the event, the session, the check-in
 *  attempt and the registration outcome, in that order of precedence. */
function pageView(options: {
	eventId: string | null;
	data: PublicEvent | undefined;
	session: ReturnType<Session>;
	checkInStatus: CheckInStatus;
	outcome: RegisterOutcome | null;
}): View {
	const { eventId, data, session, checkInStatus, outcome } = options;
	if (!eventId) return { kind: "missing-link" };
	if (data === undefined) return { kind: "loading" };
	if (data === null) return { kind: "not-found" };
	if (data.ended) return { kind: "ended" };

	// Session resolution is async (a /get-session fetch); until it settles
	// treat it like any other loading state rather than assuming signed-out
	// and flashing the form for a member who is actually signed in.
	if (session.isPending) return { kind: "loading" };

	const user = session.data?.user;
	if (user && checkInStatus !== "denied")
		return checkInStatus === "done"
			? { kind: "checked-in", name: user.name }
			: { kind: "loading" };
	return outcomeView(outcome, data.name);
}

/** What a visitor who is not being checked in sees: the form until a
 *  registration comes back, then what it said. */
function outcomeView(outcome: RegisterOutcome | null, name: string): View {
	if (outcome === "pending") return { kind: "pending" };
	if (outcome === "no-event") return { kind: "not-found" };
	return outcome === "ended" ? { kind: "ended" } : { kind: "form", name };
}

/** The visitor form: its fields, validation, and the reCAPTCHA-gated
 *  registration it submits. */
function createRegistration(options: { eventId: Accessor<string | null> }) {
	const register = useAction(api.visitors.registerVisitor);
	const [firstName, setFirstName] = createSignal("");
	const [lastName, setLastName] = createSignal("");
	const [email, setEmail] = createSignal("");

	const [showErrors, setShowErrors] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	const [submitError, setSubmitError] = createSignal<string | null>(null);
	const [outcome, setOutcome] = createSignal<RegisterOutcome | null>(null);

	const errors = createMemo(() => ({
		firstName: firstName().trim() === "" ? "Required." : null,
		lastName: lastName().trim() === "" ? "Required." : null,
		email: emailError(email()),
	}));

	const { errProps } = createFieldErrors(showErrors);

	const isValid = createMemo(() => {
		const fieldErrors = errors();
		return (
			!fieldErrors.firstName &&
			!fieldErrors.lastName &&
			!fieldErrors.email
		);
	});

	async function onSubmit(submitEvent: Event) {
		submitEvent.preventDefault();
		if (submitting()) return;
		setSubmitError(null);
		setShowErrors(true);
		if (!isValid()) return;
		const id = options.eventId();
		if (!id) return;

		setSubmitting(true);
		const token = await getCaptchaToken("visitor");
		if (token.isErr()) {
			setSubmitError(REGISTER_FAILED);
			setSubmitting(false);
			return;
		}
		const result = await call(
			register.mutateAsync({
				eventId: id as Id<"events">,
				firstName: firstName().trim(),
				lastName: lastName().trim(),
				email: email().trim(),
				token: token.value,
			}),
			REGISTER_FAILED
		);
		setSubmitting(false);
		if (result.isErr()) {
			setSubmitError(result.error.message);
			return;
		}
		setOutcome(result.value.status);
	}

	return {
		firstName,
		setFirstName,
		lastName,
		setLastName,
		email,
		setEmail,
		submitting,
		submitError,
		outcome,
		errors,
		errProps,
		onSubmit,
	};
}

/** The confirmation a signed-in member sees once they are checked in. */
function CheckedInNotice(props: { name: string | null }) {
	return (
		<div class={styles.thanks}>
			<Icon class={styles.celebration}>{ICONS.registered}</Icon>
			<h1>You're checked in ✓</h1>
			<p class={styles.intro}>
				You're checked in as {props.name}
				{" — get the Wi-Fi on the "}
				<a href="/space">space page</a>.
			</p>
		</div>
	);
}

/** The welcome heading and the name/email form. */
function RegistrationForm(props: {
	eventName: string | undefined;
	registration: ReturnType<typeof createRegistration>;
}) {
	return (
		<>
			<div class={styles.heading}>
				<h1>Welcome to J floor</h1>
				<p class={styles.event}>{props.eventName}</p>
			</div>
			<p class={styles.intro}>
				Register with your name and email to get the Wi-Fi.
			</p>
			<form
				class={styles.form}
				onSubmit={(event) => void props.registration.onSubmit(event)}
				noValidate
			>
				<NameFields
					disabled={props.registration.submitting()}
					disabledReason="Registering…"
					firstName={{
						value: props.registration.firstName(),
						onChange: props.registration.setFirstName,
						error: props.registration.errProps(
							props.registration.errors().firstName
						),
					}}
					lastName={{
						value: props.registration.lastName(),
						onChange: props.registration.setLastName,
						error: props.registration.errProps(
							props.registration.errors().lastName
						),
					}}
				/>

				<Input
					type="email"
					label="Email"
					placeholder="you@example.com"
					leadingIconName={ICONS.email}
					autocomplete="email"
					required
					disabled={props.registration.submitting()}
					disabledReason="Registering…"
					value={props.registration.email()}
					onValueChange={(event) =>
						props.registration.setEmail(event.currentTarget.value)
					}
					{...props.registration.errProps(
						props.registration.errors().email
					)}
				/>

				<SubmitErrorBanner message={props.registration.submitError()} />

				<Button
					type="submit"
					class={styles.submit}
					isLoading={props.registration.submitting()}
				>
					Register
				</Button>
				<PrivacyNoticeLine />
			</form>
		</>
	);
}

/** The event the link names (`?event=<id>`), and its public details. */
function createVisitorEvent() {
	const [params] = useSearchParams();
	const eventIdParameter = createMemo<string | null>(() => {
		const raw = params.event;
		return typeof raw === "string" && raw.trim() !== "" ? raw : null;
	});

	const event = useQuery(
		api.events.getEventPublic,
		() => ({ eventId: (eventIdParameter() ?? "") as Id<"events"> }),
		() => ({
			enabled: eventIdParameter() !== null,
			keepPreviousData: false,
		})
	);
	return { eventIdParameter, event };
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
	const session = authClient.useSession();
	const { eventIdParameter, event } = createVisitorEvent();
	const checkInStatus = createCheckInStatus({
		session,
		event,
		eventId: eventIdParameter,
	});
	const registration = createRegistration({ eventId: eventIdParameter });
	useRecaptchaScript("visitor");

	const view = createMemo<View>(() =>
		pageView({
			eventId: eventIdParameter(),
			data: event.data(),
			session: session(),
			checkInStatus: checkInStatus(),
			outcome: registration.outcome(),
		})
	);

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
						<CheckedInNotice name={checkedInName(view())} />
					</Match>
					<Match when={view().kind === "form"}>
						<RegistrationForm
							eventName={event.data()?.name}
							registration={registration}
						/>
					</Match>
				</Switch>
			</div>
		</main>
	);
}
