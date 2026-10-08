import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { eventInvite } from "./emails/generated/eventInvite.ts";
import { verifyVisitor } from "./emails/generated/verifyVisitor.ts";
import { confirmUrl, emailUrls } from "./emails/urls.ts";
import { eventLive, insertAttendanceOnce } from "./lib/attendance.ts";
import {
	issueToken,
	newConfirmToken,
	redeemToken,
	type ConfirmStatus,
} from "./lib/confirmToken.ts";
import { VERIFY_TTL_MS } from "./lib/constants.ts";
import { sendEmail } from "./lib/email.ts";
import {
	normalizeEmail,
	personByEmail,
	validEmail,
} from "./lib/emailAddress.ts";
import { mayPublicSubmit, rateLimiter } from "./lib/rateLimit.ts";
import { verifyRecaptchaToken } from "./lib/recaptcha.ts";
import { EMAIL_MAX, NAME_MAX } from "./lib/validate.ts";
import type { Wifi } from "./lib/wifi.ts";

/**
 * The register endpoint is public and unauthenticated — validate its input
 * server-side rather than trusting the form. Throws on anything malformed so a
 * bot or a hand-crafted request cannot write a junk `people` row.
 */
function validateVisitorInput(input: {
	firstName: string;
	lastName: string;
	email: string;
}): void {
	const email = input.email.trim();
	if (!validEmail(email) || email.length > EMAIL_MAX)
		throw new Error("Enter a valid email.");
	if (input.firstName.trim() === "" || input.firstName.length > NAME_MAX)
		throw new Error("First name is required.");
	if (input.lastName.trim() === "" || input.lastName.length > NAME_MAX)
		throw new Error("Last name is required.");
}

/**
 * Public visitor sign-up for a hackathon-style event: reCAPTCHA-gated, then a
 * confirm-by-email step exactly like `applications.submitApplication` — but
 * this flow is registration-only. It must NEVER dispatch a lifecycle event:
 * the application confirm fires `VERIFY_EMAIL`, which emails the whole
 * board, and that has burned prod once already. Visitor confirm sets fields
 * directly (see `confirmVisitorByToken`) and dispatches nothing.
 */
export const registerVisitor = action({
	args: {
		eventId: v.id("events"),
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		token: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<{ status: "pending" | "no-event" | "ended" }> => {
		const secret = process.env.RECAPTCHA_SECRET;
		if (!secret) throw new Error("reCAPTCHA is not configured");
		if (!(await verifyRecaptchaToken(secret, args.token, "visitor"))) {
			throw new Error("Couldn't verify you're human — please try again.");
		}
		// Global cap after reCAPTCHA, so failed bots cannot spend it and lock
		// real visitors out. Exhausted looks exactly like delivered (parity).
		if (!(await mayPublicSubmit(ctx, "visitor")))
			return { status: "pending" };
		validateVisitorInput(args);

		const event = await ctx.runQuery(api.events.getEventPublic, {
			eventId: args.eventId,
		});
		if (!event) return { status: "no-event" };
		// Hard stop, no grace: refuse BEFORE the per-address email limit and
		// the mutation, so a registration attempt against a closed event
		// neither consumes that address's email budget nor writes anything.
		if (event.ended) return { status: "ended" };

		// Per-address email-bomb guard: consume one token BEFORE arming a token
		// or writing the person row. When exhausted, return the neutral
		// `{ status: "pending" }` — the SAME status the delivered path returns,
		// so the response never leaks whether the address is throttled — WITHOUT
		// re-arming or sending. Consuming here (not at the send) is the fix: a
		// re-arm followed by a throttled send would kill the last delivered
		// email's confirm link and replace it with nothing, locking the user out.
		const { ok: mayEmail } = await rateLimiter.limit(ctx, "sendEmail", {
			key: normalizeEmail(args.email),
		});
		if (!mayEmail) return { status: "pending" };

		const token = newConfirmToken();
		const res = await ctx.runMutation(
			internal.visitors.insertOrResendVisitor,
			{
				firstName: args.firstName,
				lastName: args.lastName,
				email: args.email,
				eventId: args.eventId,
				token,
			}
		);

		// The limit was already consumed above, so these are plain sends — do
		// NOT use sendEmailLimited here or it would double-consume.
		const urls = emailUrls();
		if (res.purpose === "visitor") {
			const { html, text } = verifyVisitor({
				confirmUrl: confirmUrl("visitor", token),
				logoUrl: urls.logoUrl,
			});
			await sendEmail({
				to: args.email,
				subject: "Confirm your email for J floor Wi-Fi",
				html,
				text,
				devLog: `[verify-visitor] ${args.email}`,
			});
		} else {
			const { html, text } = eventInvite({
				eventName: event.name,
				confirmUrl: confirmUrl("eventInvite", token),
				logoUrl: urls.logoUrl,
			});
			await sendEmail({
				to: args.email,
				subject: "You're set for the J floor event",
				html,
				text,
				devLog: `[event-invite] ${args.email}`,
			});
		}
		return { status: "pending" };
	},
});

/**
 * Internal: only the reCAPTCHA-verified `registerVisitor` action reaches this.
 *
 * - No existing person: insert a fresh `visitor`/`unverified` row and a
 *   visitor-purpose confirm token for the event.
 * - Existing `visitor` row, in EITHER stage: issue a fresh visitor token for
 *   the event (replacing any unconsumed one). This covers both an
 *   abandoned/resending unverified visitor and a previously-verified visitor
 *   returning for a new event; a verified visitor keeps its `verifiedAt`
 *   (only the confirm mutation writes that field).
 * - Any non-visitor tier: NEVER write to the `people` row — that would clobber
 *   lifecycle state. Issue an `eventInvite` token instead, so the caller can
 *   send a distinct confirm email without touching the person.
 */
export const insertOrResendVisitor = internalMutation({
	args: {
		firstName: v.string(),
		lastName: v.string(),
		email: v.string(),
		eventId: v.id("events"),
		token: v.string(),
	},
	handler: async (
		ctx,
		args
	): Promise<{ purpose: "visitor" | "eventInvite" }> => {
		const email = normalizeEmail(args.email);
		const existing = await personByEmail(ctx, email);

		if (existing) {
			const purpose =
				existing.tier === "visitor" ? "visitor" : "eventInvite";
			await issueToken(ctx, {
				token: args.token,
				purpose,
				personId: existing._id,
				eventId: args.eventId,
				ttlMs: VERIFY_TTL_MS,
			});
			return { purpose };
		}

		const personId = await ctx.db.insert("people", {
			email,
			firstName: args.firstName,
			lastName: args.lastName,
			tier: "visitor",
			stage: "unverified",
			stageSince: Date.now(),
			provenance: "signup",
			door: { override: "none" },
			board: {},
			submittedAt: Date.now(),
			verifiedAt: undefined,
		});
		await issueToken(ctx, {
			token: args.token,
			purpose: "visitor",
			personId,
			eventId: args.eventId,
			ttlMs: VERIFY_TTL_MS,
		});
		return { purpose: "visitor" };
	},
});

/**
 * Redeem the visitor's confirm TOKEN and apply the whole confirm decision
 * atomically in one mutation. The token row carries the event it was issued
 * for, so a re-registration that lands between the click and this write can
 * no longer shift which event gets confirmed.
 *
 * NO applyEvent / no ctx.scheduler / no lifecycle dispatch of any kind. This is
 * the whole point of a separate visitor confirm path — see the module doc.
 */
export const confirmVisitorByToken = internalMutation({
	args: { token: v.string() },
	handler: async (
		ctx,
		{ token }
	): Promise<{
		status: ConfirmStatus;
		who?: { firstName: string; lastName: string; email: string };
	}> => {
		const r = await redeemToken(ctx, token, "visitor");
		if (r.status === "invalid") return { status: "invalid" };
		const person = await ctx.db.get(r.row.personId);
		if (person?.tier !== "visitor") return { status: "invalid" };
		const who = {
			firstName: person.firstName,
			lastName: person.lastName,
			email: person.email,
		};
		const now = Date.now();
		const event = r.row.eventId ? await ctx.db.get(r.row.eventId) : null;
		if (r.status === "already")
			return eventLive(event, now)
				? { status: "already", who }
				: { status: "ended", who };
		if (r.status === "expired") {
			// A verified visitor keeps Wi-Fi while their event runs; an
			// unverified one must register again.
			if (person.verifiedAt == null) return { status: "expired" };
			return eventLive(event, now)
				? { status: "already", who }
				: { status: "ended", who };
		}
		// Hard stop, no grace: the event this token would settle has already
		// ended. Refuse before any write — no stage flip, no attendance, no
		// Wi-Fi.
		if (!eventLive(event, now)) return { status: "ended", who };
		await ctx.db.patch(person._id, {
			stage: "verified",
			...(person.verifiedAt == null ? { verifiedAt: now } : {}),
		});
		await insertAttendanceOnce(ctx, person._id, event._id);
		return { status: "verified", who };
	},
});

export const confirmVisitor = action({
	args: { token: v.string() },
	handler: async (
		ctx,
		{ token }
	): Promise<{
		status: ConfirmStatus;
		wifi?: Wifi;
		who?: { firstName: string; lastName: string; email: string };
	}> => {
		const res = await ctx.runMutation(
			internal.visitors.confirmVisitorByToken,
			{ token }
		);
		if (res.status === "verified" || res.status === "already")
			return { ...res, wifi: await ctx.runQuery(internal.wifi.read, {}) };
		return res;
	},
});
