import { err, ok, type Result } from "neverthrow";

import { sendEmail } from "../../lib/email.ts";
import type { NotifyError } from "../../lib/errors/notify.ts";
import type { EmailMessage } from "../types.ts";

/**
 * Deliver one notification email. Deliberately plain `sendEmail`, not
 * `sendEmailLimited`: that limiter is the public forms' 3-per-hour bomb
 * guard, and a board member can legitimately get more notifications than
 * that in an hour. Is an Err when the provider rejects the email (`sendEmail` resolves
 * `false`); a provider call that throws still throws. Dispatch counts both as a
 * failed delivery.
 */
export async function sendNotificationEmail(
	to: string,
	kind: string,
	message: EmailMessage
): Promise<Result<void, NotifyError>> {
	const isSent = await sendEmail({
		to,
		subject: message.subject,
		html: message.html,
		text: message.text,
		devLog: `[notify:${kind}] ${to}: ${message.subject}`,
	});
	return isSent ? ok() : err({ type: "EmailRejected" });
}
