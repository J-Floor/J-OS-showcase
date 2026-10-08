import {
	RateLimiter,
	HOUR,
	type RunMutationCtx,
} from "@convex-dev/rate-limiter";

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
	ctx: ActionCtx,
	opts: SendEmailArgs
): Promise<boolean> {
	const { ok } = await rateLimiter.limit(ctx, "sendEmail", {
		key: normalizeEmail(opts.to),
	});
	if (ok) await sendEmail(opts);
	return ok;
}

/**
 * The global cap on the public sign-up forms, spent only by submissions that
 * passed reCAPTCHA. Exhausted logs a warning so ops sees the trip; the caller
 * answers exactly as it does on the delivered path.
 */
export async function mayPublicSubmit(
	ctx: RunMutationCtx,
	form: "application" | "visitor"
): Promise<boolean> {
	const { ok } = await rateLimiter.limit(ctx, "publicSubmit");
	if (!ok) {
		// eslint-disable-next-line no-console -- surface a tripped global cap in the Convex logs
		console.warn(
			`[publicSubmit] global cap reached; ${form} submission dropped`
		);
	}
	return ok;
}

/**
 * The caps a magic-link send must pass: the per-address `magicLinkAddress`
 * bucket, then, only for an address with no `people` row, the global
 * `magicLink` bucket, so a flood of strangers cannot lock members out. True
 * when the email may be sent; the caller answers the same either way.
 */
export async function mayMagicLink(
	ctx: RunMutationCtx,
	email: string
): Promise<boolean> {
	const perAddress = await rateLimiter.limit(ctx, "magicLinkAddress", {
		key: normalizeEmail(email),
	});
	if (!perAddress.ok) return false;
	const person = await ctx.runQuery(internal.people.getPersonByEmail, {
		email,
	});
	if (person) return true;
	return (await rateLimiter.limit(ctx, "magicLink")).ok;
}
