import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { applyDoorOverride } from "./door.ts";
import { formatEmailDate } from "./emails/format.ts";
import { alreadyActive } from "./emails/generated/alreadyActive.ts";
import { alreadyUnderReview } from "./emails/generated/alreadyUnderReview.ts";
import { reapplyAfter } from "./emails/generated/reapplyAfter.ts";
import { verifyApplication } from "./emails/generated/verifyApplication.ts";
import { confirmUrl, emailUrls } from "./emails/urls.ts";
import {
	eventLive,
	insertAttendanceOnce,
	settlePendingEvent,
} from "./lib/attendance.ts";
import { requireRole } from "./lib/authGuard.ts";
import {
	issueToken,
	newConfirmToken,
	redeemToken,
	type ConfirmStatus,
} from "./lib/confirmToken.ts";
import { VERIFY_TTL_MS } from "./lib/constants.ts";
import { sendEmail } from "./lib/email.ts";
import { validEmail } from "./lib/emailAddress.ts";
import { normalizeEmail, personByEmail } from "./lib/emailAddress.ts";
import type { PeopleError } from "./lib/errors/people.ts";
import { legalEvents, stateOf } from "./lib/lifecycle.ts";
import type { LifecycleEvent } from "./lib/lifecycleTypes.ts";
import {
	mayPublicSubmit,
	rateLimiter,
	sendEmailLimited,
} from "./lib/rateLimit.ts";
import type { ReapplyDecision } from "./lib/reapply.ts";
import { reapplyDecision } from "./lib/reapply.ts";
import { verifyRecaptchaToken } from "./lib/recaptcha.ts";
import { invariant, refuse, unwrap } from "./lib/result.ts";
import { BOARD_LEVEL } from "./lib/roles.ts";
import { parseSafeLinks } from "./lib/safeUrl.ts";
import {
	EMAIL_MAX,
	NAME_MAX,
	PHONE_MAX,
	REFERRAL_MAX,
	TEXT_MAX,
	VENTURE_NAME_MAX,
} from "./lib/validate.ts";
import {
	applyEvent,
	applyEventIfLegal,
	currentActorId,
	logFieldEdit,
} from "./lifecycle.ts";
import { scheduleLinkCheck } from "./linkSafety.ts";
import { withStatus } from "./people.ts";
import { fundingStage, productStage, vertical } from "./schema.ts";

// Shared input validators for a public application submission. The `action`
// verifies a reCAPTCHA token alongside these; the internal mutation writes them.
const applicationInput = {
	firstName: v.string(),
	lastName: v.string(),
	email: v.string(),
	phone: v.string(),
	pastBuilt: v.string(),
	ventureName: v.string(),
	description: v.string(),
	productStage: v.optional(productStage),
	fundingStage: v.optional(fundingStage),
	vertical: v.array(vertical),
	teamSize: v.number(),
	links: v.optional(
		v.array(v.object({ label: v.string(), url: v.string() }))
	),
	whyJoin: v.string(),
	referral: v.optional(v.string()),
};

type ApplicationInputFields = {
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	pastBuilt: string;
	ventureName: string;
	description: string;
	productStage?: string;
	fundingStage?: string;
	vertical: string[];
	teamSize: number;
	links?: { label: string; url: string }[];
	whyJoin: string;
	referral?: string;
};

type CappedField =
	| "firstName"
	| "lastName"
	| "ventureName"
	| "phone"
	| "email"
	| "referral"
	| "pastBuilt"
	| "description"
	| "whyJoin";

const FIELD_LIMITS: readonly (readonly [CappedField, number])[] = [
	["firstName", NAME_MAX],
	["lastName", NAME_MAX],
	["ventureName", VENTURE_NAME_MAX],
	["phone", PHONE_MAX],
	["email", EMAIL_MAX],
	["referral", REFERRAL_MAX],
	["pastBuilt", TEXT_MAX],
	["description", TEXT_MAX],
	["whyJoin", TEXT_MAX],
];

function isWithinLimit(value: string | undefined, max: number): boolean {
	return (value?.length ?? 0) <= max;
}

// Pure, server-side guard for the public application path. Refuses any
// violation so a forged or buggy client can't write malformed rows. Mirrors the
// client-side form rules; called before any DB access in `insertApplication`.
export function validateApplicationInput(
	fields: ApplicationInputFields
): Result<void, PeopleError> {
	const isInvalid =
		!Number.isInteger(fields.teamSize) ||
		fields.teamSize < 1 ||
		!Array.isArray(fields.vertical) ||
		fields.vertical.length < 1 ||
		!validEmail(fields.email) ||
		FIELD_LIMITS.some(([field, max]) => !isWithinLimit(fields[field], max));
	return isInvalid ? err({ type: "InvalidApplication" }) : ok();
}

type BlockedDecision = Extract<ReapplyDecision, { kind: "blocked" }>;

type BlockedEmailInputs = {
	greeting: string;
	email: string;
	urls: ReturnType<typeof emailUrls>;
};

type BlockedEmail = {
	html: string;
	text: string;
	subject: string;
	devLog: string;
};

const BLOCKED_EMAILS: Record<
	BlockedDecision["reason"],
	(decision: BlockedDecision, inputs: BlockedEmailInputs) => BlockedEmail
> = {
	active: (_decision, { greeting, email, urls }) => ({
		...alreadyActive({
			greeting,
			signinUrl: urls.signinUrl,
			logoUrl: urls.logoUrl,
			privacyUrl: urls.privacyUrl,
		}),
		subject: "You already have access to J floor",
		devLog: `[already-active] ${email}`,
	}),
	debounce: (decision, { email, urls }) => ({
		...reapplyAfter({
			until: formatEmailDate(decision.until ?? Date.now()),
			logoUrl: urls.logoUrl,
			privacyUrl: urls.privacyUrl,
		}),
		subject: "About your J floor application",
		devLog: `[reapply-after] ${email}`,
	}),
	under_review: (_decision, { email, urls }) => ({
		...alreadyUnderReview({
			logoUrl: urls.logoUrl,
			privacyUrl: urls.privacyUrl,
		}),
		subject: "Your J floor application is with the board",
		devLog: `[already-under-review] ${email}`,
	}),
};

function blockedApplicationEmail(
	decision: BlockedDecision,
	inputs: BlockedEmailInputs
): BlockedEmail {
	return BLOCKED_EMAILS[decision.reason](decision, inputs);
}

/**
 * The board's triage list.
 *
 * Contract: `tier === "prospect"` AND `verifiedAt != null`. Unverified sign-ups
 * stay invisible to the board exactly as they were when they lived in their own
 * table, and anyone the board has decided on has left the prospect tier
 * entirely, so no state filter is needed on top.
 */
export const list = query({
	args: {},
	handler: async (context) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		// Verified only, by index: an unverified sign-up lies outside the
		// range, so its insert does not re-run this query for every board
		// session.
		const prospects = await context.db
			.query("people")
			.withIndex("by_tier_and_verifiedAt", (range) =>
				range.eq("tier", "prospect").gte("verifiedAt", 0)
			)
			.collect();
		// Same shape as the Members and Guests rosters: all three tabs read one
		// table now, so they get one row type and share one detail drawer.
		return withStatus(context, prospects);
	},
});

/**
 * The score is a single value shared by all board members, stored on
 * `board.score`. Setting it logs the edit and asks the machine to move a
 * verified prospect into the queue; re-scoring a queued one is a legal
 * self-loop, and scoring anyone else is simply not a legal event.
 *
 * An absent `value` clears the score (the board un-rating a mis-score). Clearing
 * only wipes the number — it fires no lifecycle event, so a queued applicant
 * stays queued (unrated), never bounced back out of the queue. Same field write
 * the machine's own `RESET_SCORE` effect makes, minus any state transition.
 */
export const setScore = mutation({
	args: { personId: v.id("people"), value: v.optional(v.number()) },
	handler: async (context, { personId, value }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		const person = await context.db.get(personId);
		invariant(person, "Person not found");
		const before = person.board?.score;
		// Nothing to do when the value is unchanged (incl. clearing an already
		// unscored person): no write, no audit row, no redundant SET_SCORE.
		if (before !== value) {
			const actorId = await currentActorId(context);
			await logFieldEdit(context, {
				personId,
				field: "board.score",
				before,
				after: value,
				actorId,
			});
			await context.db.patch(personId, {
				board: { ...(person.board ?? {}), score: value },
			});
			// Clearing is not a scoring event — only a real score drives the queue.
			if (value !== undefined) {
				await applyEventIfLegal(
					context,
					personId,
					{ type: "SET_SCORE" },
					actorId
				);
			}
		}
		return null;
	},
});

type BoardDecision =
	| { kind: "deny" }
	| { kind: "member" }
	| { kind: "guest"; until?: number; hostedById?: Id<"people"> };

function eventForDecision(decision: BoardDecision): LifecycleEvent {
	switch (decision.kind) {
		case "deny":
			return { type: "DENY" };
		case "member":
			return { type: "APPROVE_MEMBER" };
		case "guest":
			return {
				type: "APPROVE_GUEST",
				until: decision.until,
				hostedById: decision.hostedById,
			};
	}
}

/**
 * The board's decision on a prospect: deny, approve as a member, or approve as
 * a guest — with the board member vouching for them, and an optional end date.
 * One mutation, one event each, all guards and effects owned by the machine.
 */
export const decide = mutation({
	args: {
		personId: v.id("people"),
		decision: v.union(
			v.object({ kind: v.literal("deny") }),
			v.object({ kind: v.literal("member") }),
			v.object({
				kind: v.literal("guest"),
				/** Absent = open-ended guest access. Optional on purpose: the
				 *  board grants residents with no end date in sight, and
				 *  `sendApprovalEmail` already has a windowless variant. */
				until: v.optional(v.number()),
				hostedById: v.optional(v.id("people")),
				/**
				 * Withhold door access from this guest. Applied in the same
				 * transaction as the approval, so a guest is never briefly
				 * approved WITH access before a second call takes it away.
				 */
				blockDoor: v.optional(v.boolean()),
			})
		),
	},
	handler: async (context, { personId, decision }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(
			await applyEvent(
				context,
				personId,
				eventForDecision(decision),
				await currentActorId(context)
			)
		);
		// After the approval, so the audit row reads as a decision made about a
		// guest rather than about an applicant. Same writer as the drawer's own
		// control, so the trail is identical either way.
		if (decision.kind === "guest" && decision.blockDoor === true) {
			await applyDoorOverride(
				context,
				personId,
				"force_off",
				"Approved without door access"
			);
		}
		return null;
	},
});

/** Board undo for a mis-clicked deny: back into the queue, `deniedAt` cleared. */
export const undeny = mutation({
	args: { personId: v.id("people") },
	handler: async (context, { personId }) => {
		unwrap(await requireRole(context, BOARD_LEVEL));
		unwrap(
			await applyEvent(
				context,
				personId,
				{ type: "UNDENY" },
				await currentActorId(context)
			)
		);
		return null;
	},
});

type ApplicationConfirmStatus = Exclude<ConfirmStatus, "ended">;

/** The one row the re-application decision needs for an email. */
export const reapplyContext = internalQuery({
	args: { email: v.string() },
	handler: async (context, { email }) => personByEmail(context, email),
});

/**
 * Internal: only the reCAPTCHA-verified `submitApplication` action reaches this.
 * One `people` row per email. A first application inserts the row; a
 * re-application by a row that is still unverified overwrites it; any other
 * re-application is STAGED on the confirm token and applied only when the
 * email owner clicks the link, so a stranger who knows an address cannot
 * rewrite that person's profile or lifecycle.
 */
export const insertApplication = internalMutation({
	args: { ...applicationInput, token: v.string() },
	handler: async (context, args): Promise<Id<"people">> => {
		const { token, ...raw } = args;
		const input = { ...raw, email: normalizeEmail(raw.email) };
		unwrap(validateApplicationInput(input));
		const links = input.links
			? unwrap(parseSafeLinks(input.links))
			: undefined;

		const existing = await personByEmail(context, input.email);
		const decision = reapplyDecision(existing, Date.now());
		if (decision.kind === "blocked") refuse({ type: "ApplicationBlocked" });

		const submittedAt = Date.now();
		const fields = {
			firstName: input.firstName,
			lastName: input.lastName,
			phone: input.phone,
			// The one vertical field: top-level on the person, which is what the
			// tables and the CSV export read.
			vertical: input.vertical,
			venture: {
				name: input.ventureName,
				productStage: input.productStage,
				fundingStage: input.fundingStage,
				teamSize: input.teamSize,
				description: input.description,
				whyJoin: input.whyJoin,
				pastBuilt: input.pastBuilt,
				links,
				referral: input.referral,
			},
			submittedAt,
		};

		if (existing && existing.stage !== "unverified") {
			await issueToken(context, {
				token,
				purpose: "application",
				personId: existing._id,
				ttlMs: VERIFY_TTL_MS,
				payload: fields,
			});
			return existing._id;
		}

		let personId: Id<"people">;
		if (existing) {
			// Re-application reuses the row: personEvents keeps every prior
			// denial, approval and kick, the machine resets the score, and the
			// board's written notes survive on purpose.
			await context.db.patch(existing._id, {
				...fields,
				verifiedAt: undefined,
			});
			unwrap(
				await applyEvent(context, existing._id, { type: "REAPPLY" })
			);
			personId = existing._id;
		} else {
			personId = await context.db.insert("people", {
				email: input.email,
				tier: "prospect",
				stage: "unverified",
				stageSince: submittedAt,
				provenance: "signup",
				door: { override: "none" },
				board: {},
				...fields,
			});
		}
		await issueToken(context, {
			token,
			purpose: "application",
			personId,
			ttlMs: VERIFY_TTL_MS,
		});
		await scheduleLinkCheck(context, personId, links);
		return personId;
	},
});

// Public, unauthenticated submit for the `/sign-up` page. The reCAPTCHA check is
// the gate; on success it hands off to the internal insert mutation. Actions can
// fetch in the default runtime, so no "use node".
export const submitApplication = action({
	args: { ...applicationInput, token: v.string() },
	handler: async (context, args): Promise<{ status: "pending" }> => {
		// Distinct server-side error (not the generic bot message) so ops can
		// diagnose a misconfigured deployment rather than seeing it surface as a
		// user-facing verification failure.
		const secret = process.env.RECAPTCHA_SECRET;
		invariant(secret, "reCAPTCHA is not configured");
		const { token, ...typed } = args;
		if (!unwrap(await verifyRecaptchaToken(secret, token, "signup")))
			refuse({ type: "RecaptchaFailed" });
		// Global cap after reCAPTCHA, so failed bots cannot spend it and lock
		// real applicants out. Exhausted looks exactly like delivered (parity).
		if (!(await mayPublicSubmit(context, "application"))) {
			return { status: "pending" };
		}
		const fields = { ...typed, email: normalizeEmail(typed.email) };

		// Before the membership lookup: invalid input must fail the same way for
		// every address, or the error itself tells a prober who is already in.
		unwrap(validateApplicationInput(fields));
		if (fields.links) unwrap(parseSafeLinks(fields.links));

		const person = await context.runQuery(
			internal.applications.reapplyContext,
			{
				email: fields.email,
			}
		);
		const decision = reapplyDecision(person, Date.now());
		const urls = emailUrls();
		const storedName = person?.firstName.trim();
		const greeting = storedName ? `Hi ${storedName},` : "Hi,";

		// Every blocked outcome is told by email, never by the response: the
		// response is the same for a member, a queued applicant and a stranger,
		// so the form cannot be used to probe who is in.
		if (decision.kind === "blocked") {
			const { html, text, subject, devLog } = blockedApplicationEmail(
				decision,
				{
					greeting,
					email: fields.email,
					urls,
				}
			);
			await sendEmailLimited(context, {
				to: fields.email,
				subject,
				html,
				text,
				devLog,
			});
			return { status: "pending" };
		}

		// insert | reuse → arm a confirm token, then email the link. Consume the
		// per-address email limit BEFORE arming the token: on a throttled
		// re-submit, return the SAME neutral status the delivered path returns
		// (enumeration parity) WITHOUT re-arming — so the last-delivered confirm
		// link stays valid instead of being overwritten with no replacement sent.
		const { ok: mayEmail } = await rateLimiter.limit(context, "sendEmail", {
			key: fields.email,
		});
		if (!mayEmail) return { status: "pending" };

		const confirmToken = newConfirmToken();
		await context.runMutation(internal.applications.insertApplication, {
			...fields,
			token: confirmToken,
		});
		const { html, text } = verifyApplication({
			confirmUrl: confirmUrl("application", confirmToken),
			logoUrl: urls.logoUrl,
			privacyUrl: urls.privacyUrl,
		});
		await sendEmail({
			to: fields.email,
			subject: "Confirm your J floor application",
			html,
			text,
			devLog: `[verify-application] ${fields.email}`,
		});
		return { status: "pending" };
	},
});

/**
 * Resolve and consume an application confirm token in one transaction. A
 * staged re-application (payload on the token) is applied here, and only
 * here: the email owner has now proven they sent it.
 */
export const confirmApplicationByToken = internalMutation({
	args: { token: v.string() },
	handler: async (
		context,
		{ token }
	): Promise<{ status: ApplicationConfirmStatus }> => {
		const redeemed = await redeemToken(context, token, "application");
		if (redeemed.status !== "ok") return { status: redeemed.status };
		const person = await context.db.get(redeemed.row.personId);
		if (!person) return { status: "invalid" };
		const now = Date.now();
		if (redeemed.row.payload) {
			// The link was staged when REAPPLY was legal; the person may have moved
			// since (e.g. became active). Applying would throw and roll back, so
			// the dead link answers "invalid" instead.
			if (!legalEvents(stateOf(person)).includes("REAPPLY")) {
				return { status: "invalid" };
			}
			await context.db.patch(person._id, {
				...redeemed.row.payload,
				verifiedAt: now,
			});
			unwrap(await applyEvent(context, person._id, { type: "REAPPLY" }));
			await scheduleLinkCheck(
				context,
				person._id,
				redeemed.row.payload.venture.links
			);
		} else {
			await context.db.patch(person._id, { verifiedAt: now });
		}
		// An unconfirmed visitor who applied still has a live visitor token; settle it.
		await settlePendingEvent(context, person._id);
		// A token migrated from a visitor's pending registration carries its event.
		const event = redeemed.row.eventId
			? await context.db.get(redeemed.row.eventId)
			: null;
		if (eventLive(event, now)) {
			await insertAttendanceOnce(context, person._id, event._id);
		}
		// VERIFY_EMAIL's effects send the "we've received it" email and notify
		// the board — this mutation does not send anything itself.
		unwrap(await applyEvent(context, person._id, { type: "VERIFY_EMAIL" }));
		return { status: "verified" };
	},
});

export const confirmApplication = action({
	args: { token: v.string() },
	handler: (
		context,
		{ token }
	): Promise<{ status: ApplicationConfirmStatus }> =>
		context.runMutation(internal.applications.confirmApplicationByToken, {
			token,
		}),
});
