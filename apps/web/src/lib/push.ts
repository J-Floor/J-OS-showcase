import { api } from "../../convex/_generated/api";
import { isIosUserAgent, isStandalone } from "../shared/pwaInstall.ts";

import { convex } from "./convex.ts";
import { withTimeout } from "./withTimeout.ts";

/**
 * Where this device stands with push:
 * - `unsupported`: no service worker / PushManager (email still works).
 * - `ios`: iOS push needs a Home Screen app, and an installed app cannot
 *   finish magic-link sign-in, so push is unavailable there; email covers it.
 *   Never nudge iOS users to install.
 * - `denied` / `default` / `granted`: the browser's notification permission.
 */
export type PushSupport =
	| "unsupported"
	| "ios"
	| "denied"
	| "default"
	| "granted";

export function pushSupport(): PushSupport {
	if (typeof navigator === "undefined") return "unsupported";
	if (
		isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints) &&
		!isStandalone()
	)
		return "ios";
	if (
		!("serviceWorker" in navigator) ||
		typeof PushManager === "undefined" ||
		typeof Notification === "undefined"
	)
		return "unsupported";
	return Notification.permission;
}

function vapidPublicKey(): string | undefined {
	const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
	return key === "" ? undefined : key;
}

/** Push is wired for this build (the server's public key is baked in). */
export function pushConfigured(): boolean {
	return vapidPublicKey() !== undefined;
}

/** `applicationServerKey` wants raw bytes; VAPID keys travel as base64url. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
	const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
	return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
	if (!("serviceWorker" in navigator)) return undefined;
	return navigator.serviceWorker.getRegistration();
}

async function currentSubscription(): Promise<PushSubscription | null> {
	const reg = await registration();
	return reg ? reg.pushManager.getSubscription() : null;
}

const SW_READY_TIMEOUT_MS = 10_000;

const SW_NOT_READY_MESSAGE = "The service worker is not ready.";

/** `enablePush` gave up waiting for the service worker. */
export function isServiceWorkerNotReady(err: unknown): boolean {
	return err instanceof Error && err.message === SW_NOT_READY_MESSAGE;
}

function readyRegistration(): Promise<ServiceWorkerRegistration> {
	return withTimeout(
		navigator.serviceWorker.ready,
		SW_READY_TIMEOUT_MS,
		SW_NOT_READY_MESSAGE
	);
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
	const { p256dh, auth }: Partial<Record<string, string>> =
		subscription.toJSON().keys ?? {};
	if (!p256dh || !auth)
		throw new Error("The push subscription is missing its keys.");
	await convex.mutation(api.notify.subscriptions.subscribe, {
		endpoint: subscription.endpoint,
		p256dh,
		auth,
		userAgent: navigator.userAgent,
	});
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
	const existing = subscription.options.applicationServerKey;
	if (!existing) return false;
	const bytes = new Uint8Array(existing);
	return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
}

/** The subscription for the current VAPID key: reuse the existing one, or
 *  replace it when it was made for a different key. */
async function subscriptionFor(
	reg: ServiceWorkerRegistration,
	key: string
): Promise<PushSubscription> {
	const bytes = base64UrlToBytes(key);
	const existing = await reg.pushManager.getSubscription();
	if (existing && sameKey(existing, bytes)) return existing;
	if (existing) await existing.unsubscribe();
	return reg.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: bytes,
	});
}

/**
 * Ask for permission, subscribe this device and register it with the server.
 * Call ONLY from a click handler: iOS rejects a permission prompt outside a
 * user gesture. Resolves to the resulting state.
 */
export async function enablePush(): Promise<PushSupport> {
	const key = vapidPublicKey();
	if (!key) throw new Error("Push notifications are not configured.");
	const permission = await Notification.requestPermission();
	if (permission !== "granted") return permission;
	const reg = await readyRegistration();
	await saveSubscription(await subscriptionFor(reg, key));
	return "granted";
}

const UNSUBSCRIBE_TIMEOUT_MS = 4_000;

/** Stop push on this device: ask the server to forget it (needs the session),
 *  and ALWAYS drop the browser subscription, even when that call fails, so a
 *  shared device stops receiving the previous person's pushes. A failed server
 *  call is rethrown afterwards (an offline client queues the mutation, so it
 *  also gives up after a few seconds); its orphaned row is pruned on the next
 *  send (404/410). Also run on sign-out. */
export async function disablePush(): Promise<void> {
	const subscription = await currentSubscription();
	if (!subscription) return;
	try {
		await withTimeout(
			convex.mutation(api.notify.subscriptions.unsubscribe, {
				endpoint: subscription.endpoint,
			}),
			UNSUBSCRIBE_TIMEOUT_MS,
			"The server did not confirm in time."
		);
	} finally {
		await subscription.unsubscribe();
	}
}

/** On app start: push services rotate endpoints, so re-register whatever
 *  subscription this device holds (re-subscribing if the server's VAPID key
 *  changed). Never prompts. */
export async function resyncPush(): Promise<void> {
	if (pushSupport() !== "granted") return;
	const subscription = await currentSubscription();
	if (!subscription) return;
	const key = vapidPublicKey();
	if (key && !sameKey(subscription, base64UrlToBytes(key))) {
		const reg = await registration();
		if (reg) await saveSubscription(await subscriptionFor(reg, key));
		return;
	}
	await saveSubscription(subscription);
}

export async function pushSubscribed(): Promise<boolean> {
	return (await currentSubscription()) !== null;
}
