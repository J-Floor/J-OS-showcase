import type {
	EmailProvider,
	OutgoingEmail,
	SendOutcome,
} from "./emailProvider.ts";

const RESEND_URL = "https://api.resend.com/emails";
const FREE_DAILY_LIMIT = 100;
const FREE_MONTHLY_LIMIT = 3000;
const TOO_MANY_REQUESTS = 429;
const DEFAULT_FROM = "J floor <onboarding@resend.dev>";

/** A used-count header as a non-negative integer, or undefined. */
function usedCount(
	headers: Headers | undefined,
	name: string
): number | undefined {
	const raw = headers?.get(name) ?? "";
	return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

async function errorName(response: Response): Promise<string | undefined> {
	try {
		const body = (await response.json()) as { name?: unknown };
		return typeof body.name === "string" ? body.name : undefined;
	} catch {
		return undefined;
	}
}

async function outcomeOf(response: Response): Promise<SendOutcome> {
	if (response.ok) {
		const dailyUsed = usedCount(response.headers, "x-resend-daily-quota");
		const monthlyUsed = usedCount(
			response.headers,
			"x-resend-monthly-quota"
		);
		return {
			kind: "sent",
			usage: {
				...(dailyUsed === undefined ? {} : { dailyUsed }),
				...(monthlyUsed === undefined ? {} : { monthlyUsed }),
			},
		};
	}
	if (response.status === TOO_MANY_REQUESTS) {
		const name = await errorName(response);
		if (name === "daily_quota_exceeded")
			return { kind: "quotaExceeded", window: "daily" };
		if (name === "monthly_quota_exceeded")
			return { kind: "quotaExceeded", window: "monthly" };
	}
	return { kind: "rejected", status: response.status };
}

/** The Resend adapter, free plan. `EMAIL_FROM` must be a verified-domain
 *  sender to email anyone; the default only reaches the account owner. */
export function resendProvider(apiKey: string): EmailProvider {
	return {
		limits: { daily: FREE_DAILY_LIMIT, monthly: FREE_MONTHLY_LIMIT },
		billing: "perRecipient",
		async send(message: OutgoingEmail) {
			const response = await fetch(RESEND_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
					to: message.to,
					subject: message.subject,
					html: message.html,
					...(message.text ? { text: message.text } : {}),
					...(message.attachments?.length
						? { attachments: message.attachments }
						: {}),
				}),
			});
			return outcomeOf(response);
		},
	};
}

/** The adapter configured on this deployment, or undefined without a key. */
export function resendFromEnvironment(): EmailProvider | undefined {
	const apiKey = process.env.RESEND_API_KEY;
	return apiKey ? resendProvider(apiKey) : undefined;
}
