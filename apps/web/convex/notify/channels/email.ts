import { sendEmail } from "../../lib/email.ts";
import type { EmailMessage } from "../types.ts";

/**
 * Deliver one notification email. Deliberately plain `sendEmail`, not
 * `sendEmailLimited`: that limiter is the public forms' 3-per-hour bomb
 * guard, and a board member can legitimately get more notifications than
 * that in an hour. Throws when the provider call throws or rejects the email
 * (`sendEmail` resolves `false`), which dispatch counts as a failed delivery.
 */
export async function sendNotificationEmail(
	to: string,
	kind: string,
	message: EmailMessage
): Promise<void> {
	const sent = await sendEmail({
		to,
		subject: message.subject,
		html: message.html,
		text: message.text,
		devLog: `[notify:${kind}] ${to}: ${message.subject}`,
	});
	if (!sent) throw new Error(`email to ${to} was rejected by the provider`);
}
