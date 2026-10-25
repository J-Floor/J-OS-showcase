import { Result } from "neverthrow";

import { emailError } from "../../shared/isValidEmail.ts";

import { normalizeUrl } from "./links.ts";
import type { FundingStage, ProductStage, Vertical } from "./options.ts";

const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

export type SignUpValues = {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	pastBuilt: string;
	ventureName: string;
	description: string;
	productStage: ProductStage | "";
	fundingStage: FundingStage | "";
	verticals: Vertical[];
	teamSize: string;
	links: string[];
	whyJoin: string;
};

const parseUrl = Result.fromThrowable(
	(value: string) => new URL(normalizeUrl(value)),
	() => "not a URL"
);

function isValidUrl(value: string): boolean {
	return parseUrl(value).match(
		(url) =>
			// Require a dotted host so "foo" alone is still rejected.
			(url.protocol === "http:" || url.protocol === "https:") &&
			url.hostname.includes("."),
		() => false
	);
}

// Lenient international phone check: allow +, digits, spaces, hyphens, parens
// and dots, then require 7–15 actual digits (E.164 caps at 15). Not a strict
// per-country validation — just enough to reject obvious non-numbers.
function isValidPhone(value: string): boolean {
	const trimmed = value.trim();
	if (!/^\+?[\d\s().-]+$/.test(trimmed)) return false;
	const digits = trimmed.replaceAll(/\D/g, "");
	return (
		digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS
	);
}

function requiredError(value: string): string | null {
	return value.trim() === "" ? "Required." : null;
}

function phoneError(phone: string): string | null {
	if (phone.trim() === "") return "Required.";
	return isValidPhone(phone)
		? null
		: "Enter a valid phone number (include country code).";
}

function teamSizeError(teamSize: string): string | null {
	if (teamSize.trim() === "") return "Required.";
	const size = Number(teamSize);
	return !Number.isInteger(size) || size < 1
		? "Enter a whole number of 1 or more."
		: null;
}

function urlError(url: string, index: number): string | null {
	if (index === 0 && url.trim() === "")
		return "A profile or site URL is required.";
	return url.trim() === "" || isValidUrl(url.trim())
		? null
		: "Enter a valid URL (https://…).";
}

type ScalarField = Exclude<keyof SignUpValues, "links"> | "referral";

/** Error text per field (null = valid); `urls` has one per link slot. */
type SignUpErrors = Record<ScalarField, string | null> & {
	urls: (string | null)[];
};

/** Per-field error text (null = valid), computed eagerly from the form's
 *  values. */
export function validateSignUp(values: SignUpValues): SignUpErrors {
	return {
		firstName: requiredError(values.firstName),
		lastName: requiredError(values.lastName),
		email: emailError(values.email),
		phone: phoneError(values.phone),
		pastBuilt: requiredError(values.pastBuilt),
		ventureName: requiredError(values.ventureName),
		description: requiredError(values.description),
		productStage: values.productStage === "" ? "Select a stage." : null,
		fundingStage:
			values.fundingStage === "" ? "Select how you're funded." : null,
		verticals: values.verticals.length === 0 ? "Pick at least one." : null,
		teamSize: teamSizeError(values.teamSize),
		urls: values.links.map((url, index) => urlError(url, index)),
		whyJoin: requiredError(values.whyJoin),
		// Referral is the name of the person who referred them — optional,
		// no format constraint.
		referral: null,
	};
}

/** Whether every field is valid. */
export function isSignUpValid(errors: SignUpErrors): boolean {
	const { urls, ...fieldErrors } = errors;
	return (
		Object.values(fieldErrors).every((error) => error === null) &&
		urls.every((url) => url === null)
	);
}
