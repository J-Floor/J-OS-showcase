import { Button, fireConfetti, Icon, Logo } from "@j-os/design-system";
import { useLocation } from "@solidjs/router";
import { onMount, Show } from "solid-js";

import { ICONS } from "../../shared/icons.ts";
import { useRecaptchaScript } from "../../shared/recaptcha.ts";
import { PrivacyNoticeLine } from "../privacy/PrivacyNoticeLine.tsx";

import styles from "./SignUp.module.scss";
import {
	IdentityFields,
	IndustryField,
	LinkFields,
	MotivationFields,
	StageFields,
	TeamFields,
	VentureFields,
} from "./SignUpFields.tsx";
import { createSignUpForm } from "./signUpForm.ts";

/** What the applicant sees once the form is sent: the application is not
 *  sent until they click the link in the email. */
function SubmittedNotice(props: { email: string }) {
	return (
		<div
			class={styles.thanks}
			ref={(element) => {
				onMount(() => {
					fireConfetti(element);
				});
			}}
		>
			<Icon class={styles.celebration}>{ICONS.registered}</Icon>
			<h1>Click the button in the email to send your application</h1>
			<p class={styles.intro}>
				We've sent a confirmation link to {props.email}. Click it to
				send your application to the board.{" "}
				<strong>Your application is NOT SENT yet.</strong>
			</p>
			<p class={styles.intro}>
				Already have access, or an application in review? The email
				tells you what to do instead.
			</p>
		</div>
	);
}

/**
 * Public, unauthenticated `/sign-up` page. Mirrors the live Notion application
 * form, verifies the submitter with invisible reCAPTCHA v3, and submits via the
 * `applications.submitApplication` action (the reCAPTCHA check is the gate).
 */
export function SignUp() {
	// Visitors converting to full applicants arrive with their name + email
	// already known (passed as router navigation state); prefill but keep
	// every field editable.
	const nav = useLocation<{
		firstName?: string;
		lastName?: string;
		email?: string;
	}>();
	const form = createSignUpForm(nav.state ?? {});
	useRecaptchaScript("signup");

	return (
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title="J floor" />
				<Show
					when={!form.done()}
					fallback={<SubmittedNotice email={form.fields.email()} />}
				>
					<h1>Apply to J floor</h1>
					<p class={styles.intro}>
						Tell us about you and what you're building.
					</p>
					<form
						class={styles.form}
						onSubmit={(event) => void form.onSubmit(event)}
						noValidate
					>
						<IdentityFields form={form} />
						<VentureFields form={form} />
						<StageFields form={form} />
						<IndustryField form={form} />
						<TeamFields form={form} />
						<LinkFields form={form} />
						<MotivationFields form={form} />

						<Show when={form.submitError()}>
							<div class={styles.banner} role="alert">
								<Icon>{ICONS.error}</Icon>
								<span>{form.submitError()}</span>
							</div>
						</Show>

						<Button
							type="submit"
							class={styles.submit}
							isLoading={form.submitting()}
						>
							<Icon>send</Icon>Submit application
						</Button>
						<PrivacyNoticeLine />
					</form>
				</Show>
			</div>
		</main>
	);
}
