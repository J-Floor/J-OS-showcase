import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { formatEmailDate } from "./emails/format.ts";
import { applicationReceived } from "./emails/generated/applicationReceived.ts";
import { approvalGuest } from "./emails/generated/approvalGuest.ts";
import { approvalGuestOpen } from "./emails/generated/approvalGuestOpen.ts";
import { approvalMember } from "./emails/generated/approvalMember.ts";
import { memberUpgrade } from "./emails/generated/memberUpgrade.ts";
import { rejection } from "./emails/generated/rejection.ts";
import { emailUrls } from "./emails/urls.ts";
import { sendEmail } from "./lib/email.ts";
import { isBoardLevel } from "./lib/roles.ts";
import { guestUntilLabel } from "./notify/guests.ts";

/** Polite, no-reason rejection with a reapply hint. Scheduled from `transition`. */
export const sendRejectionEmail = internalAction({
	args: { email: v.string(), name: v.string(), venture: v.string() },
	handler: async (_ctx, { email, name, venture }) => {
		const urls = emailUrls();
		const { html, text } = rejection({
			name,
			venture,
			logoUrl: urls.logoUrl,
		});
		await sendEmail({
			to: email,
			subject: "Update on your J floor application",
			html,
			text,
			devLog: `[rejection] ${name} <${email}>`,
		});
	},
});

/**
 * Tokenless approval email, scheduled when a person is promoted into an access
 * tier. Reads the committed person row to pick the member or guest variant
 * (the guest variant states the access window). Carries NO auth token — only
 * the sign-in URL — so it never trains users to click login links in mail.
 */
export const sendApprovalEmail = internalAction({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const person = await ctx.runQuery(internal.people.getPersonByEmail, {
			email,
		});
		if (!person || isBoardLevel(person.tier)) return;
		const urls = emailUrls();
		const name = person.firstName;

		if (person.tier === "guest") {
			if (person.accessUntil == null) {
				// Open-ended guest: no access window → send the windowless variant
				const { html, text } = approvalGuestOpen({
					name,
					signinUrl: urls.signinUrl,
					logoUrl: urls.logoUrl,
				});
				await sendEmail({
					to: email,
					subject: "Welcome to J floor - Guest access",
					html,
					text,
					devLog: `[approval-guest] ${name} <${email}>`,
				});
			} else {
				// Windowed guest: state the access dates
				const { html, text } = approvalGuest({
					name,
					fromDate: formatEmailDate(person.accessFrom ?? Date.now()),
					untilDate: guestUntilLabel(
						person.accessUntilLocal,
						person.accessUntil
					),
					signinUrl: urls.signinUrl,
					logoUrl: urls.logoUrl,
				});
				await sendEmail({
					to: email,
					subject: "Welcome to J floor - Guest access",
					html,
					text,
					devLog: `[approval-guest] ${name} <${email}>`,
				});
			}
			return;
		}

		// member (or any other non-board tier) → member variant
		const { html, text } = approvalMember({
			name,
			signinUrl: urls.signinUrl,
			logoUrl: urls.logoUrl,
		});
		await sendEmail({
			to: email,
			subject: "Welcome to J floor - Membership access",
			html,
			text,
			devLog: `[approval-member] ${name} <${email}>`,
		});
	},
});

/**
 * Sent when a guest is promoted to member. Today the promotion fired
 * `sendApprovalEmail`, i.e. the same message a brand-new approval receives —
 * the exact bug the lifecycle spec exists to fix. Scheduled by the machine's
 * EMAIL:memberUpgrade effect, never by a caller.
 */
export const sendMemberUpgradeEmail = internalAction({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const person = await ctx.runQuery(internal.people.getPersonByEmail, {
			email,
		});
		if (!person) return;
		const urls = emailUrls();
		const { html, text } = memberUpgrade({
			name: person.firstName,
			signinUrl: urls.signinUrl,
			logoUrl: urls.logoUrl,
		});
		await sendEmail({
			to: email,
			subject: "You're now a J floor member",
			html,
			text,
			devLog: `[member-upgrade] ${person.firstName} <${email}>`,
		});
	},
});

/**
 * "We've received your application", sent when the magic link is clicked.
 * Scheduled by the machine's EMAIL:applicationReceived effect.
 */
export const sendApplicationReceivedEmail = internalAction({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const person = await ctx.runQuery(internal.people.getPersonByEmail, {
			email,
		});
		if (!person) return;
		const urls = emailUrls();
		const { html, text } = applicationReceived({
			name: person.firstName,
			logoUrl: urls.logoUrl,
		});
		await sendEmail({
			to: email,
			subject: "We've received your J floor application",
			html,
			text,
			devLog: `[application-received] ${email}`,
		});
	},
});
