import {
	Button,
	Combobox,
	fireConfetti,
	Icon,
	Input,
	Logo,
	NumberInput,
	Select,
	TextArea,
} from "@j-os/design-system";
import { useLocation } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import {
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import { ICONS } from "../../shared/icons.ts";
import { PrivacyNoticeLine } from "../privacy/PrivacyNoticeLine.tsx";

import { buildLinks, normalizeUrl } from "./links.ts";
import {
	productStageOptions,
	fundingStageOptions,
	verticalOptions,
	type ProductStage,
	type FundingStage,
	type Vertical,
} from "./options.ts";
import styles from "./SignUp.module.scss";

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

function isValidUrl(value: string): boolean {
	try {
		const url = new URL(normalizeUrl(value));
		// Require a dotted host so "foo" alone is still rejected.
		return (
			(url.protocol === "http:" || url.protocol === "https:") &&
			url.hostname.includes(".")
		);
	} catch {
		return false;
	}
}

// Lenient international phone check: allow +, digits, spaces, hyphens, parens
// and dots, then require 7–15 actual digits (E.164 caps at 15). Not a strict
// per-country validation — just enough to reject obvious non-numbers.
function isValidPhone(value: string): boolean {
	const v = value.trim();
	if (!/^\+?[\d\s().-]+$/.test(v)) return false;
	const digits = v.replace(/\D/g, "");
	return digits.length >= 7 && digits.length <= 15;
}

/**
 * Public, unauthenticated `/sign-up` page. Mirrors the live Notion application
 * form, verifies the submitter with invisible reCAPTCHA v3, and submits via the
 * `applications.submitApplication` action (the reCAPTCHA check is the gate).
 */
export function SignUp() {
	const submit = useAction(api.applications.submitApplication);

	// Visitors converting to full applicants arrive with their name + email
	// already known (passed as router navigation state); prefill but keep
	// every field editable.
	const nav = useLocation<{
		firstName?: string;
		lastName?: string;
		email?: string;
	}>();

	const [firstName, setFirstName] = createSignal(nav.state?.firstName ?? "");
	const [lastName, setLastName] = createSignal(nav.state?.lastName ?? "");
	const [email, setEmail] = createSignal(nav.state?.email ?? "");
	const [phone, setPhone] = createSignal("");
	const [pastBuilt, setPastBuilt] = createSignal("");
	const [ventureName, setVentureName] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [productStage, setProductStage] = createSignal<ProductStage | "">("");
	const [fundingStage, setFundingStage] = createSignal<FundingStage | "">("");
	const [verticals, setVerticals] = createSignal<Vertical[]>([]);
	const [teamSize, setTeamSize] = createSignal("1");
	const [links, setLinks] = createSignal(["", "", "", ""]);
	const [whyJoin, setWhyJoin] = createSignal("");
	const [referral, setReferral] = createSignal("");

	// Errors are only revealed once the user has tried to submit, so the form
	// doesn't shout before they've had a chance to fill it in.
	const [showErrors, setShowErrors] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	const [submitError, setSubmitError] = createSignal<string | null>(null);
	const [done, setDone] = createSignal(false);

	onMount(() => {
		if (!SITE_KEY) {
			// eslint-disable-next-line no-console -- dev hint for a missing required env var
			console.warn(
				"VITE_RECAPTCHA_SITE_KEY is not set — signup captcha will fail"
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
		// leak onto every other (authenticated) page after visiting /sign-up.
		onCleanup(() => {
			script.remove();
			document.querySelector(".grecaptcha-badge")?.remove();
		});
	});

	function setLink(index: number, value: string) {
		setLinks((prev) => {
			const next = [...prev];
			next[index] = value;
			return next;
		});
	}

	// Per-field error text (null = valid). Computed eagerly; only surfaced once
	// `showErrors()` is true (or, post-submit, always).
	const errors = createMemo(() => {
		const teamSizeNum = Number(teamSize());
		const urlErrors = links().map((url, i) => {
			if (i === 0 && url.trim() === "")
				return "A profile or site URL is required.";
			if (url.trim() !== "" && !isValidUrl(url.trim()))
				return "Enter a valid URL (https://…).";
			return null;
		});
		return {
			firstName: firstName().trim() === "" ? "Required." : null,
			lastName: lastName().trim() === "" ? "Required." : null,
			email:
				email().trim() === ""
					? "Required."
					: !EMAIL_RE.test(email().trim())
						? "Enter a valid email."
						: null,
			phone:
				phone().trim() === ""
					? "Required."
					: !isValidPhone(phone())
						? "Enter a valid phone number (include country code)."
						: null,
			pastBuilt: pastBuilt().trim() === "" ? "Required." : null,
			ventureName: ventureName().trim() === "" ? "Required." : null,
			description: description().trim() === "" ? "Required." : null,
			productStage: productStage() === "" ? "Select a stage." : null,
			fundingStage:
				fundingStage() === "" ? "Select how you're funded." : null,
			verticals: verticals().length === 0 ? "Pick at least one." : null,
			teamSize:
				teamSize().trim() === ""
					? "Required."
					: !Number.isInteger(teamSizeNum) || teamSizeNum < 1
						? "Enter a whole number of 1 or more."
						: null,
			urls: urlErrors,
			whyJoin: whyJoin().trim() === "" ? "Required." : null,
			// Referral is the name of the person who referred them — optional,
			// no format constraint.
			referral: null,
		};
	});

	const isValid = createMemo(() => {
		const e = errors();
		return (
			!e.firstName &&
			!e.lastName &&
			!e.email &&
			!e.phone &&
			!e.pastBuilt &&
			!e.ventureName &&
			!e.description &&
			!e.productStage &&
			!e.fundingStage &&
			!e.verticals &&
			!e.teamSize &&
			!e.whyJoin &&
			e.urls.every((u) => u === null)
		);
	});

	// Surface a field error only after a submit attempt.
	function err(field: string | null): string | undefined {
		return showErrors() && field ? field : undefined;
	}

	// `invalid` / `errorText` pair every field needs, from one error string.
	function errProps(field: string | null) {
		const text = err(field);
		return { invalid: Boolean(text), errorText: text };
	}

	async function onSubmit(event: Event) {
		event.preventDefault();
		if (submitting()) return;
		setSubmitError(null);
		setShowErrors(true);
		if (!isValid()) return;
		// isValid() guarantees both stages were chosen; narrow `… | ""` -> the
		// enum type for the payload instead of casting.
		const product = productStage();
		const funding = fundingStage();
		if (product === "" || funding === "") return;

		setSubmitting(true);
		try {
			if (!SITE_KEY || !window.grecaptcha) {
				throw new Error("captcha-unavailable");
			}
			const token = await window.grecaptcha.execute(SITE_KEY, {
				action: "signup",
			});

			const builtLinks = buildLinks(links());

			await submit.mutateAsync({
				firstName: firstName().trim(),
				lastName: lastName().trim(),
				email: email().trim(),
				phone: phone().trim(),
				pastBuilt: pastBuilt().trim(),
				ventureName: ventureName().trim(),
				description: description().trim(),
				productStage: product,
				fundingStage: funding,
				vertical: verticals(),
				teamSize: Number(teamSize()),
				links: builtLinks,
				whyJoin: whyJoin().trim(),
				...(referral().trim() !== ""
					? { referral: referral().trim() }
					: {}),
				token,
			});
			setDone(true);
		} catch {
			setSubmitError(
				"Something went wrong submitting your application. Please try again."
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main class={styles.screen}>
			<div class={styles.card}>
				<Logo class={styles.logo} title="J floor" />
				<Show
					when={!done()}
					fallback={
						<div
							class={styles.thanks}
							ref={(el) => {
								onMount(() => {
									fireConfetti(el);
								});
							}}
						>
							<Icon class={styles.celebration}>
								{ICONS.registered}
							</Icon>
							<h1>
								Click the button in the email to send your
								application
							</h1>
							<p class={styles.intro}>
								We've sent a confirmation link to {email()}.
								Click it to send your application to the board.{" "}
								<strong>
									Your application is NOT SENT yet.
								</strong>
							</p>
							<p class={styles.intro}>
								Already have access, or an application in
								review? The email tells you what to do instead.
							</p>
						</div>
					}
				>
					<h1>Apply to J floor</h1>
					<p class={styles.intro}>
						Tell us about you and what you're building.
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
								disabledReason="Submitting…"
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
								disabledReason="Submitting…"
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
							helperText="Use your company email if you have one."
							placeholder="you@example.com"
							leadingIconName={ICONS.email}
							autocomplete="email"
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={email()}
							onValueChange={(e) =>
								setEmail(e.currentTarget.value)
							}
							{...errProps(errors().email)}
						/>

						<Input
							type="tel"
							label="Phone (WhatsApp)"
							helperText="Include your country code."
							placeholder="+41 79 000 00 00"
							leadingIconName={ICONS.phone}
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={phone()}
							onValueChange={(e) =>
								setPhone(e.currentTarget.value)
							}
							{...errProps(errors().phone)}
						/>

						<Input
							label="Venture / project name"
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={ventureName()}
							onValueChange={(e) =>
								setVentureName(e.currentTarget.value)
							}
							{...errProps(errors().ventureName)}
						/>

						<TextArea
							label="What is your venture/project about?"
							helperText="A few sentences, elevator pitch style."
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={description()}
							onInput={setDescription}
							{...errProps(errors().description)}
						/>

						<TextArea
							label="What have you built before?"
							helperText="A short summary is fine."
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={pastBuilt()}
							onInput={setPastBuilt}
							{...errProps(errors().pastBuilt)}
						/>

						<Select.Root
							label="Product stage"
							helperText="How far along is the product?"
							placeholder="Pick one"
							allowClearing
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							options={productStageOptions.map((o) => ({
								value: o.value,
								title: o.label,
							}))}
							value={
								productStage() === "" ? [] : [productStage()]
							}
							onValueChange={(d) =>
								setProductStage(
									(d.value[0] as ProductStage | undefined) ??
										""
								)
							}
							{...errProps(errors().productStage)}
						>
							<Select.Content>
								<For each={productStageOptions}>
									{(o) => (
										<Select.Option
											value={o.value}
											title={o.label}
										/>
									)}
								</For>
							</Select.Content>
						</Select.Root>

						<Select.Root
							label="Funding stage"
							helperText="Have you raised, and at what stage?"
							placeholder="Pick one"
							allowClearing
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							options={fundingStageOptions.map((o) => ({
								value: o.value,
								title: o.label,
							}))}
							value={
								fundingStage() === "" ? [] : [fundingStage()]
							}
							onValueChange={(d) =>
								setFundingStage(
									(d.value[0] as FundingStage | undefined) ??
										""
								)
							}
							{...errProps(errors().fundingStage)}
						>
							<Select.Content>
								<For each={fundingStageOptions}>
									{(o) => (
										<Select.Option
											value={o.value}
											title={o.label}
										/>
									)}
								</For>
							</Select.Content>
						</Select.Root>

						<Combobox.Root
							label="Industry / vertical"
							helperText="Pick all that apply."
							placeholder="Pick one or more"
							multiple
							allowClearing
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							items={verticalOptions.map((o) => ({
								value: o.value,
								label: o.label,
							}))}
							value={verticals()}
							onValueChange={(d) =>
								setVerticals(d.value as Vertical[])
							}
							{...errProps(errors().verticals)}
						/>

						<NumberInput
							label="Team size"
							helperText="Only count the people that will use the space. Each member should apply separately."
							min={1}
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={teamSize()}
							onValueChange={(d) => setTeamSize(d.value)}
							{...errProps(errors().teamSize)}
						/>

						<Input
							type="url"
							label="Link to your profile (LinkedIn, X, GitHub, or site)"
							helperText="LinkedIn preferred."
							placeholder="https://…"
							leadingIconName={ICONS.link}
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={links()[0]}
							onValueChange={(e) => {
								setLink(0, e.currentTarget.value);
							}}
							{...errProps(errors().urls[0])}
						/>
						{/* Optional extra links reveal one at a time: each shows only
						    once the previous one has a value. */}
						<For each={[1, 2, 3]}>
							{(i) => (
								<Show when={links()[i - 1].trim() !== ""}>
									<Input
										type="url"
										label="Link to something else we should look at (optional)"
										placeholder="https://…"
										leadingIconName={ICONS.link}
										disabled={submitting()}
										disabledReason="Submitting…"
										value={links()[i]}
										onValueChange={(e) => {
											setLink(i, e.currentTarget.value);
										}}
										{...errProps(errors().urls[i])}
									/>
								</Show>
							)}
						</For>

						<TextArea
							label="Why do you want to join J floor?"
							required
							disabled={submitting()}
							disabledReason="Submitting…"
							value={whyJoin()}
							onInput={setWhyJoin}
							{...errProps(errors().whyJoin)}
						/>

						<Input
							label="Who referred you?"
							helperText="Optional — the name of the person who referred you."
							placeholder="e.g. Ada Lovelace"
							leadingIconName={ICONS.person}
							disabled={submitting()}
							disabledReason="Submitting…"
							value={referral()}
							onValueChange={(e) =>
								setReferral(e.currentTarget.value)
							}
							{...errProps(errors().referral)}
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
							<Icon>send</Icon>Submit application
						</Button>
						<PrivacyNoticeLine />
					</form>
				</Show>
			</div>
		</main>
	);
}
