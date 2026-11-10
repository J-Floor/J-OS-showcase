import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";

import { normalizeEmail } from "./emailAddress.ts";
import type {
	EmailPriority,
	ProviderLimits,
	SendOutcome,
} from "./emailProvider.ts";
import { emailProvider } from "./emailProviderEnv.ts";

export type EmailContext = { runMutation: ActionCtx["runMutation"] };

export type SendEmailArgs = {
	to: string;
	subject: string;
	html: string;
	/** Optional plain-text alternative (improves deliverability). */
	text?: string;
	/** Optional file attachments (base64-encoded content). */
	attachments?: { filename: string; content: string }[];
	/** How much of the provider quota this email may use. */
	priority: EmailPriority;
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

/** Align the quota counters with what the provider just told us. */
async function recordOutcome(
	context: EmailContext,
	limits: ProviderLimits,
	outcome: SendOutcome
): Promise<void> {
	if (outcome.kind === "quotaExceeded") {
		await context.runMutation(internal.emailQuota.sync, {
			limits,
			exhausted: outcome.window,
		});
	} else if (
		outcome.kind === "sent" &&
		(outcome.usage?.dailyUsed !== undefined ||
			outcome.usage?.monthlyUsed !== undefined)
	) {
		await context.runMutation(internal.emailQuota.sync, {
			limits,
			...outcome.usage,
		});
	}
}

/**
 * Send one transactional email through the configured provider. Without a
 * provider nothing is sent: EMAIL_DEV_LOG=1 (dev only) logs `devLog`, which
 * may hold a sign-in link; otherwise only the recipient and subject are
 * logged. EMAIL_ALLOWLIST (staging) sends only to listed addresses and logs
 * `devLog` for the rest. A provider failure logs recipient and subject, never
 * `devLog`. Needs an action context (`fetch`).
 *
 * Resolves `true` when sent or only logged, `false` when the quota guard
 * refused it or the provider rejected it.
 */
export async function sendEmail(
	context: EmailContext,
	options: SendEmailArgs
): Promise<boolean> {
	const provider = emailProvider();
	const isWithheld = isLeftOffAllowlist(options.to);
	if (!provider || isWithheld) {
		// eslint-disable-next-line no-console -- not sent: surface in the Convex logs
		console.log(
			isWithheld || process.env.EMAIL_DEV_LOG === "1"
				? options.devLog
				: `[email] not sent (no email provider) to ${options.to}: ${options.subject}`
		);
		return true;
	}
	const limits = provider.limits;
	const isReserved = await context.runMutation(internal.emailQuota.reserve, {
		priority: options.priority,
		// Every send here has one recipient, so it costs one unit under either billing.
		cost: 1,
		limits,
	});
	if (!isReserved) {
		// eslint-disable-next-line no-console -- surface a quota refusal in the Convex logs
		console.warn(`[email] quota: ${options.priority} refused`);
		return false;
	}
	const outcome = await provider.send({
		to: options.to,
		subject: options.subject,
		html: options.html,
		text: options.text,
		attachments: options.attachments,
	});
	try {
		await recordOutcome(context, limits, outcome);
	} catch {
		// eslint-disable-next-line no-console -- surface a failed quota sync in the Convex logs
		console.error("[email] quota sync failed");
		// A counter that lags must not turn a delivered email into a failure.
	}
	if (outcome.kind === "sent") return true;
	const reason =
		outcome.kind === "rejected"
			? `rejected (${String(outcome.status)})`
			: "quota exceeded";
	// eslint-disable-next-line no-console -- surface delivery failures in the Convex logs
	console.error(
		`[email] provider ${reason} to ${options.to}: ${options.subject}`
	);
	return false;
}
