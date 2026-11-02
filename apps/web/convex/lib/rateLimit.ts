import {
	RateLimiter,
	HOUR,
	type ActionCtx as RateLimitActionContext,
	type MutationCtx as RateLimitMutationContext,
} from "@convex-dev/rate-limiter";

/** What `rateLimiter.limit` accepts: a mutation or an action context. */
type RateLimitContext = RateLimitMutationContext | RateLimitActionContext;

import { components, internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

import { sendEmail, type SendEmailArgs } from "./email.ts";
import { normalizeEmail } from "./emailAddress.ts";

// Per-recipient outbound-email cap. One address receives at most
// EMAIL_LIMIT_COUNT J-Floor emails per window, across every public form
// (visitor register, event invite, application submit) — an email-bomb guard.
export const EMAIL_LIMIT_COUNT = 3;
const EMAIL_LIMIT_WINDOW_MS = HOUR;

export const PUBLIC_SUBMIT_PER_HOUR = 300;
const MAGIC_LINKS_PER_HOUR = 300;
const MAGIC_LINKS_PER_ADDRESS_PER_HOUR = 10;

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	sendEmail: {
		kind: "fixed window",
		rate: EMAIL_LIMIT_COUNT,
		period: EMAIL_LIMIT_WINDOW_MS,
	},
	publicSubmit: {
		kind: "fixed window",
		rate: PUBLIC_SUBMIT_PER_HOUR,
		period: HOUR,
	},
	magicLink: {
		kind: "fixed window",
		rate: MAGIC_LINKS_PER_HOUR,
		period: HOUR,
	},
	magicLinkAddress: {
		kind: "fixed window",
		rate: MAGIC_LINKS_PER_ADDRESS_PER_HOUR,
		period: HOUR,
	},
});

/**
 * Send an email unless the per-address limit is exhausted. Consumes one
 * `sendEmail` token keyed on the (normalized) recipient; sends only if allowed.
 * Returns whether it sent. Callers on the throttled path must still return the
 * same status they return on the sent path (enumeration parity).
 */
export async function sendEmailLimited(
	context: ActionCtx,
	options: SendEmailArgs
): Promise<boolean> {
	const { ok } = await rateLimiter.limit(context, "sendEmail", {
		key: normalizeEmail(options.to),
	});
	if (ok) await sendEmail(options);
	return ok;
}

/**
 * The global cap on the public sign-up forms, spent only by submissions that
 * passed reCAPTCHA. Exhausted logs a warning so ops sees the trip; the caller
 * answers exactly as it does on the delivered path.
 */
export async function mayPublicSubmit(
	context: RateLimitContext,
	form: "application" | "visitor"
): Promise<boolean> {
	const { ok } = await rateLimiter.limit(context, "publicSubmit");
	if (!ok) {
		// eslint-disable-next-line no-console -- surface a tripped global cap in the Convex logs
		console.warn(
			`[publicSubmit] global cap reached; ${form} submission dropped`
		);
	}
	return ok;
}

/**
 * What a magic-link request gets: the per-address `magicLinkAddress` bucket
 * first (`limited` when spent), then the person lookup. A known person gets
 * the `link`. An address with no `people` row spends the global `magicLink`
 * bucket, so a flood of strangers cannot lock members out, and gets the
 * `noAccount` email, or `limited` when that bucket is spent. The caller
 * answers the same either way.
 */
export async function magicLinkDecision(
	context: RateLimitContext,
	email: string
): Promise<"link" | "noAccount" | "limited"> {
	const perAddress = await rateLimiter.limit(context, "magicLinkAddress", {
		key: normalizeEmail(email),
	});
	if (!perAddress.ok) return "limited";
	const person = await context.runQuery(internal.people.getPersonByEmail, {
		email,
	});
	if (person) return "link";
	const overall = await rateLimiter.limit(context, "magicLink");
	return overall.ok ? "noAccount" : "limited";
}
