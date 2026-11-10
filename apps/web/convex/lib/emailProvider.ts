import { v, type Infer } from "convex/values";

/** How much of the provider quota a send may use; see `emailQuota.ts`. */
export const emailPriorityValidator = v.union(
	v.literal("critical"),
	v.literal("anonymous"),
	v.literal("notification"),
	v.literal("digest")
);
export type EmailPriority = Infer<typeof emailPriorityValidator>;

export const quotaWindowValidator = v.union(
	v.literal("daily"),
	v.literal("monthly")
);
export type QuotaWindow = Infer<typeof quotaWindowValidator>;

export type OutgoingEmail = {
	to: string;
	subject: string;
	html: string;
	text?: string;
	attachments?: { filename: string; content: string }[];
};

export const providerLimitsValidator = v.object({
	daily: v.union(v.number(), v.null()),
	monthly: v.union(v.number(), v.null()),
});
export type ProviderLimits = Infer<typeof providerLimitsValidator>;

export type SendOutcome =
	| { kind: "sent"; usage?: { dailyUsed?: number; monthlyUsed?: number } }
	| { kind: "quotaExceeded"; window: QuotaWindow }
	| { kind: "rejected"; status: number };

/** One email vendor. `limits` null = no cap in that window. `billing` says
 *  whether the vendor counts each address or each message. */
export type EmailProvider = {
	limits: ProviderLimits;
	billing: "perRecipient" | "perMessage";
	send(message: OutgoingEmail): Promise<SendOutcome>;
};

let injectedProvider: EmailProvider | undefined;

// dry-ignore -- one-line test seam, same shape as the door provider's
export function setEmailProviderForTests(
	provider: EmailProvider | undefined
): void {
	injectedProvider = provider;
}

export function injectedEmailProvider(): EmailProvider | undefined {
	return injectedProvider;
}
