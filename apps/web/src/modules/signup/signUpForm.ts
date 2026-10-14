import { useAction } from "convex-solidjs";
import { createMemo, createSignal } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { MAX_LINKS } from "../../../convex/lib/safeUrl.ts";
import { SITE_KEY } from "../../shared/recaptcha.ts";

import { buildLinks } from "./links.ts";
import type { FundingStage, ProductStage, Vertical } from "./options.ts";
import {
	isSignUpValid,
	validateSignUp,
	type SignUpValues,
} from "./signUpValidation.ts";

/** Visitors converting to full applicants arrive with their name + email
 *  already known (passed as router navigation state). */
type SignUpPrefill = {
	firstName?: string;
	lastName?: string;
	email?: string;
};

/** The ordered URL slots: the first is required, the rest reveal one at a
 *  time as the previous one gets a value. */
export const EXTRA_LINK_INDEXES = Array.from(
	{ length: MAX_LINKS - 1 },
	(_, index) => index + 1
);

/** One signal per field of the application, prefilled but always editable. */
function createSignUpFields(prefill: SignUpPrefill) {
	const [firstName, setFirstName] = createSignal(prefill.firstName ?? "");
	const [lastName, setLastName] = createSignal(prefill.lastName ?? "");
	const [email, setEmail] = createSignal(prefill.email ?? "");
	const [phone, setPhone] = createSignal("");
	const [pastBuilt, setPastBuilt] = createSignal("");
	const [ventureName, setVentureName] = createSignal("");
	const [description, setDescription] = createSignal("");
	const [productStage, setProductStage] = createSignal<ProductStage | "">("");
	const [fundingStage, setFundingStage] = createSignal<FundingStage | "">("");
	const [verticals, setVerticals] = createSignal<Vertical[]>([]);
	const [teamSize, setTeamSize] = createSignal("1");
	const [links, setLinks] = createSignal(
		Array.from({ length: MAX_LINKS }, () => "")
	);
	const [whyJoin, setWhyJoin] = createSignal("");
	const [referral, setReferral] = createSignal("");

	function setLink(index: number, value: string) {
		setLinks((prev) => {
			const next = [...prev];
			next[index] = value;
			return next;
		});
	}

	return {
		firstName,
		setFirstName,
		lastName,
		setLastName,
		email,
		setEmail,
		phone,
		setPhone,
		pastBuilt,
		setPastBuilt,
		ventureName,
		setVentureName,
		description,
		setDescription,
		productStage,
		setProductStage,
		fundingStage,
		setFundingStage,
		verticals,
		setVerticals,
		teamSize,
		setTeamSize,
		links,
		setLink,
		whyJoin,
		setWhyJoin,
		referral,
		setReferral,
	};
}

type SignUpFields = ReturnType<typeof createSignUpFields>;

function readValues(fields: SignUpFields): SignUpValues {
	return {
		firstName: fields.firstName(),
		lastName: fields.lastName(),
		email: fields.email(),
		phone: fields.phone(),
		pastBuilt: fields.pastBuilt(),
		ventureName: fields.ventureName(),
		description: fields.description(),
		productStage: fields.productStage(),
		fundingStage: fields.fundingStage(),
		verticals: fields.verticals(),
		teamSize: fields.teamSize(),
		links: fields.links(),
		whyJoin: fields.whyJoin(),
	};
}

/** The application as `submitApplication` takes it: trimmed, with the
 *  optional referral left out when blank. */
function applicationPayload(
	fields: SignUpFields,
	stages: { product: ProductStage; funding: FundingStage },
	token: string
) {
	return {
		firstName: fields.firstName().trim(),
		lastName: fields.lastName().trim(),
		email: fields.email().trim(),
		phone: fields.phone().trim(),
		pastBuilt: fields.pastBuilt().trim(),
		ventureName: fields.ventureName().trim(),
		description: fields.description().trim(),
		productStage: stages.product,
		fundingStage: stages.funding,
		vertical: fields.verticals(),
		teamSize: Number(fields.teamSize()),
		links: buildLinks(fields.links()),
		whyJoin: fields.whyJoin().trim(),
		...(fields.referral().trim() === ""
			? {}
			: { referral: fields.referral().trim() }),
		token,
	};
}

/**
 * The sign-up form's state: its fields, their errors (revealed only once the
 * user has tried to submit, so the form doesn't shout before they've had a
 * chance to fill it in), and the reCAPTCHA-gated submission.
 */
export function createSignUpForm(prefill: SignUpPrefill) {
	const submit = useAction(api.applications.submitApplication);
	const fields = createSignUpFields(prefill);
	const [showErrors, setShowErrors] = createSignal(false);
	const [submitting, setSubmitting] = createSignal(false);
	const [submitError, setSubmitError] = createSignal<string | null>(null);
	const [done, setDone] = createSignal(false);

	const errors = createMemo(() => validateSignUp(readValues(fields)));
	const isValid = createMemo(() => isSignUpValid(errors()));

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
		const product = fields.productStage();
		const funding = fields.fundingStage();
		if (product === "" || funding === "") return;

		setSubmitting(true);
		try {
			if (!SITE_KEY || !window.grecaptcha) {
				throw new Error("captcha-unavailable");
			}
			const token = await window.grecaptcha.execute(SITE_KEY, {
				action: "signup",
			});
			await submit.mutateAsync(
				applicationPayload(fields, { product, funding }, token)
			);
			setDone(true);
		} catch {
			setSubmitError(
				"Something went wrong submitting your application. Please try again."
			);
		} finally {
			setSubmitting(false);
		}
	}

	return {
		fields,
		errors,
		errProps,
		submitting,
		submitError,
		done,
		onSubmit,
	};
}

export type SignUpForm = ReturnType<typeof createSignUpForm>;
