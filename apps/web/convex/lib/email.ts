export type SendEmailArgs = {
	to: string;
	subject: string;
	html: string;
	/** Optional plain-text alternative (improves deliverability). */
	text?: string;
	/** Optional file attachments (base64-encoded content), forwarded to Resend. */
	attachments?: { filename: string; content: string }[];
	/** Logged instead of sending when no provider is configured and EMAIL_DEV_LOG=1. */
	devLog: string;
};

/**
 * Send a transactional email via Resend. Without RESEND_API_KEY nothing is
 * sent: a deployment with EMAIL_DEV_LOG=1 (dev only) logs `devLog`, which may
 * hold a sign-in link; any other logs the recipient and subject only. A
 * Resend failure logs the recipient and subject, never `devLog`. MUST run in an action /
 * httpAction context — it uses `fetch`, which mutations and queries can't.
 *
 * The default sender (`onboarding@resend.dev`) only delivers to the Resend
 * account owner's own address; set EMAIL_FROM to a verified-domain sender to
 * email anyone.
 *
 * Resolves `true` when the email was sent or only logged (no provider), and
 * `false` when the provider rejected it. Callers that don't care may ignore it.
 */
export async function sendEmail(opts: SendEmailArgs): Promise<boolean> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		// eslint-disable-next-line no-console -- no provider configured: surface in the Convex logs
		console.log(
			process.env.EMAIL_DEV_LOG === "1"
				? opts.devLog
				: `[email] not sent (no RESEND_API_KEY) to ${opts.to}: ${opts.subject}`
		);
		return true;
	}
	const from = process.env.EMAIL_FROM ?? "J floor <onboarding@resend.dev>";
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: opts.to,
			subject: opts.subject,
			html: opts.html,
			...(opts.text ? { text: opts.text } : {}),
			...(opts.attachments?.length
				? { attachments: opts.attachments }
				: {}),
		}),
	});
	if (!res.ok) {
		// eslint-disable-next-line no-console -- surface delivery failures in the Convex logs
		console.error(
			`[email] Resend failed (${String(res.status)}) to ${opts.to}: ${opts.subject}`
		);
		return false;
	}
	return true;
}
