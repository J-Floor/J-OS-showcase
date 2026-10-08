import type { PushKeys } from "../types.ts";

export type VapidConfig = {
	subject: string;
	publicKey: string;
	privateKey: string;
};

/**
 * Sends one push. Rejects with an error carrying `statusCode` on an HTTP
 * failure, the way web-push's `WebPushError` does.
 */
export type PushSender = (
	subscription: PushKeys,
	body: string,
	vapid: VapidConfig
) => Promise<void>;

let injected: PushSender | undefined;

/** Tests swap the real web-push sender for a fake (like
 *  `setDoorProviderForTests`), so they never load the Node package. */
export function setPushSenderForTests(sender: PushSender | undefined): void {
	injected = sender;
}

export function injectedPushSender(): PushSender | undefined {
	return injected;
}

/** All three VAPID vars, or null when push is not configured here. */
export function vapidFromEnv(): VapidConfig | null {
	const subject = process.env.VAPID_SUBJECT;
	const publicKey = process.env.VAPID_PUBLIC_KEY;
	const privateKey = process.env.VAPID_PRIVATE_KEY;
	if (!subject || !publicKey || !privateKey) return null;
	return { subject, publicKey, privateKey };
}

/** The push service no longer knows this subscription; it will never work again. */
export function isGone(err: unknown): boolean {
	const status = (err as { statusCode?: unknown } | null)?.statusCode;
	return status === 404 || status === 410;
}
