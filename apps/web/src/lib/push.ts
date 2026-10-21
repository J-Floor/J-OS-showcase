import { err, errAsync, ok, okAsync, Result, ResultAsync } from "neverthrow";

import { api } from "../../convex/_generated/api";
import { isIosUserAgent, isStandalone } from "../shared/pwaInstall.ts";

import { call, type ClientError } from "./call.ts";
import { convex } from "./convex.ts";
import { isTimeout, withTimeout } from "./withTimeout.ts";

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
	return !("serviceWorker" in navigator) ||
		typeof PushManager === "undefined" ||
		typeof Notification === "undefined"
		? "unsupported"
		: Notification.permission;
}

function vapidPublicKey(): string | undefined {
	const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
	return key === "" ? undefined : key;
}

/** Push is wired for this build (the server's public key is baked in). */
export function pushConfigured(): boolean {
	return vapidPublicKey() !== undefined;
}

const BASE64_GROUP_LENGTH = 4;

/** `applicationServerKey` wants raw bytes; VAPID keys travel as base64url. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const padded =
		value +
		"=".repeat(
			(BASE64_GROUP_LENGTH - (value.length % BASE64_GROUP_LENGTH)) %
				BASE64_GROUP_LENGTH
		);
	const raw = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
	const bytes = new Uint8Array(raw.length);
	for (let index = 0; index < raw.length; index += 1)
		bytes[index] = raw.charCodeAt(index);
	return bytes;
}

const TURN_ON_FAILED = "Could not turn on notifications.";
const TURN_OFF_FAILED = "Could not turn off notifications.";
const READ_FAILED = "Could not read the notification settings.";

const NOT_CONFIGURED: ClientError = {
	code: "PushNotConfigured",
	message: "Push notifications are not configured.",
};

const SERVICE_WORKER_NOT_READY: ClientError = {
	code: "ServiceWorkerNotReady",
	message: "The app is still starting up. Try again in a moment.",
};

const SERVER_TIMEOUT: ClientError = {
	code: "ServerTimeout",
	message: "The server did not confirm in time.",
};

/** A browser push API call, as a Result carrying `message` on failure. */
function fromBrowser<T>(
	promise: PromiseLike<T>,
	message: string
): ResultAsync<T, ClientError> {
	return ResultAsync.fromPromise(
		Promise.resolve(promise),
		(): ClientError => ({ code: "PushBrowserFailed", message })
	);
}

const decodeKey = Result.fromThrowable(
	base64UrlToBytes,
	(): ClientError => NOT_CONFIGURED
);

function registration(
	message: string
): ResultAsync<ServiceWorkerRegistration | undefined, ClientError> {
	return "serviceWorker" in navigator
		? fromBrowser(navigator.serviceWorker.getRegistration(), message)
		: okAsync(undefined);
}

function currentSubscription(
	message: string
): ResultAsync<PushSubscription | null, ClientError> {
	return registration(message).andThen(
		(reg): ResultAsync<PushSubscription | null, ClientError> =>
			reg
				? fromBrowser(reg.pushManager.getSubscription(), message)
				: okAsync(null)
	);
}

const SW_READY_TIMEOUT_MS = 10_000;

function readyRegistration(): ResultAsync<
	ServiceWorkerRegistration,
	ClientError
> {
	return withTimeout(
		ResultAsync.fromSafePromise(navigator.serviceWorker.ready),
		SW_READY_TIMEOUT_MS
	).mapErr((): ClientError => SERVICE_WORKER_NOT_READY);
}

function saveSubscription(
	subscription: PushSubscription
): ResultAsync<void, ClientError> {
	const { p256dh, auth }: Partial<Record<string, string>> =
		subscription.toJSON().keys ?? {};
	if (!p256dh || !auth)
		return errAsync({
			code: "PushSubscriptionMissingKeys",
			message: "The push subscription is missing its keys.",
		});
	return call(
		convex.mutation(api.notify.subscriptions.subscribe, {
			endpoint: subscription.endpoint,
			p256dh,
			auth,
			userAgent: navigator.userAgent,
		}),
		TURN_ON_FAILED
	).map(() => {});
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
	const existing = subscription.options.applicationServerKey;
	if (!existing) return false;
	const bytes = new Uint8Array(existing);
	return (
		bytes.length === key.length &&
		bytes.every((byte, index) => byte === key[index])
	);
}

/** The subscription for the current VAPID key: reuse the existing one, or
 *  replace it when it was made for a different key. */
function subscriptionFor(
	reg: ServiceWorkerRegistration,
	key: string
): ResultAsync<PushSubscription, ClientError> {
	return decodeKey(key)
		.asyncAndThen((bytes) =>
			fromBrowser(reg.pushManager.getSubscription(), TURN_ON_FAILED).map(
				(existing) => ({ bytes, existing })
			)
		)
		.andThen(
			({
				bytes,
				existing,
			}): ResultAsync<PushSubscription, ClientError> => {
				if (existing && sameKey(existing, bytes))
					return okAsync(existing);
				function subscribe() {
					return fromBrowser(
						reg.pushManager.subscribe({
							userVisibleOnly: true,
							applicationServerKey: bytes,
						}),
						TURN_ON_FAILED
					);
				}
				return existing
					? fromBrowser(
							existing.unsubscribe(),
							TURN_ON_FAILED
						).andThen(subscribe)
					: subscribe();
			}
		);
}

/**
 * Ask for permission, subscribe this device and register it with the server.
 * Call ONLY from a click handler: iOS rejects a permission prompt outside a
 * user gesture. Resolves to the resulting state; a failure's message is ready
 * to show.
 */
export function enablePush(): ResultAsync<PushSupport, ClientError> {
	const key = vapidPublicKey();
	return key
		? fromBrowser(Notification.requestPermission(), TURN_ON_FAILED).andThen(
				(permission): ResultAsync<PushSupport, ClientError> =>
					permission === "granted"
						? readyRegistration()
								.andThen((reg) => subscriptionFor(reg, key))
								.andThen(saveSubscription)
								.map((): PushSupport => "granted")
						: okAsync(permission)
			)
		: errAsync(NOT_CONFIGURED);
}

const UNSUBSCRIBE_TIMEOUT_MS = 4_000;

/** Stop push on this device: ask the server to forget it (needs the session),
 *  and ALWAYS drop the browser subscription, even when that call fails, so a
 *  shared device stops receiving the previous person's pushes. A failed server
 *  call is returned afterwards (an offline client queues the mutation, so it
 *  also gives up after a few seconds); its orphaned row is pruned on the next
 *  send (404/410). Also run on sign-out. */
export async function disablePush(): Promise<Result<void, ClientError>> {
	const found = await currentSubscription(TURN_OFF_FAILED);
	if (found.isErr()) return err(found.error);
	const subscription = found.value;
	if (!subscription) return ok();
	const server = await withTimeout(
		call(
			convex.mutation(api.notify.subscriptions.unsubscribe, {
				endpoint: subscription.endpoint,
			}),
			TURN_OFF_FAILED
		),
		UNSUBSCRIBE_TIMEOUT_MS
	).mapErr(
		// Only the timeout comes without a message to show.
		(error): ClientError => (isTimeout(error) ? SERVER_TIMEOUT : error)
	);
	const dropped = await fromBrowser(
		subscription.unsubscribe(),
		TURN_OFF_FAILED
	);
	return server.isErr() ? err(server.error) : dropped.map(() => {});
}

/** The server's VAPID key as bytes; none when it is unset or undecodable (a
 *  broken build, so it is warned about). */
function currentKeyBytes(): Uint8Array | undefined {
	const key = vapidPublicKey();
	if (key === undefined) return undefined;
	const decoded = decodeKey(key);
	if (decoded.isErr())
		// eslint-disable-next-line no-console -- an undecodable key means a broken build; surface it for debugging
		console.warn("[push] the VAPID public key could not be decoded");
	return decoded.unwrapOr(undefined);
}

/** On app start: push services rotate endpoints, so re-register whatever
 *  subscription this device holds (re-subscribing if the server's VAPID key
 *  changed). Never prompts. */
export async function resyncPush(): Promise<Result<void, ClientError>> {
	if (pushSupport() !== "granted") return ok();
	const found = await currentSubscription(TURN_ON_FAILED);
	if (found.isErr()) return err(found.error);
	const subscription = found.value;
	if (!subscription) return ok();
	const key = vapidPublicKey();
	const bytes = currentKeyBytes();
	if (key && bytes && !sameKey(subscription, bytes)) {
		const reg = await registration(TURN_ON_FAILED);
		if (reg.isErr()) return err(reg.error);
		return reg.value
			? subscriptionFor(reg.value, key).andThen(saveSubscription)
			: ok();
	}
	return saveSubscription(subscription);
}

export function pushSubscribed(): ResultAsync<boolean, ClientError> {
	return currentSubscription(READ_FAILED).map(
		(subscription) => subscription !== null
	);
}
