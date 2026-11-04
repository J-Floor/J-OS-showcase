import { normalizeEmail } from "./emailAddress.ts";

export type SendEmailArgs = {
	to: string;
	subject: string;
	html: string;
	/** Optional plain-text alternative (improves deliverability). */
	text?: string;
	/** Optional file attachments (base64-encoded content), forwarded to Resend. */
	attachments?: { filename: string; content: string }[];
	/** Logged instead of sending when no provider is configured and
	 *  EMAIL_DEV_LOG=1, or when EMAIL_ALLOWLIST leaves the recipient out. */
	devLog: string;
};

/**
 * `EMAIL_ALLOWLIST`'s addresses, normalized, or undefined when it is unset
 * (prod, dev). Staging sets it so only the listed people get real email.
 */
export function emailAllowlist(): string[] | undefined {
	const raw = process.env.EMAIL_ALLOWLIST;
	return raw
		? raw
				.split(",")
				.map((address) => normalizeEmail(address))
				.filter(Boolean)
		: undefined;
}

function isLeftOffAllowlist(to: string): boolean {
	const allowlist = emailAllowlist();
	return allowlist !== undefined && !allowlist.includes(normalizeEmail(to));
}

/**
 * Send a transactional email via Resend. Without RESEND_API_KEY nothing is
 * sent: a deployment with EMAIL_DEV_LOG=1 (dev only) logs `devLog`, which may
 * hold a sign-in link; any other logs the recipient and subject only. A
 * deployment with EMAIL_ALLOWLIST (staging) sends only to the listed
 * addresses and logs `devLog` for every other one. A
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
export async function sendEmail(options: SendEmailArgs): Promise<boolean> {
	const apiKey = process.env.RESEND_API_KEY;
	const isWithheld = isLeftOffAllowlist(options.to);
	if (!apiKey || isWithheld) {
		// eslint-disable-next-line no-console -- not sent: surface in the Convex logs
		console.log(
			isWithheld || process.env.EMAIL_DEV_LOG === "1"
				? options.devLog
				: `[email] not sent (no RESEND_API_KEY) to ${options.to}: ${options.subject}`
		);
		return true;
	}
	const from = process.env.EMAIL_FROM ?? "J floor <onboarding@resend.dev>";
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: options.to,
			subject: options.subject,
			html: options.html,
			...(options.text ? { text: options.text } : {}),
			...(options.attachments?.length
				? { attachments: options.attachments }
				: {}),
		}),
	});
	if (!response.ok) {
		// eslint-disable-next-line no-console -- surface delivery failures in the Convex logs
		console.error(
			`[email] Resend failed (${String(response.status)}) to ${options.to}: ${options.subject}`
		);
		return false;
	}
	return true;
}
