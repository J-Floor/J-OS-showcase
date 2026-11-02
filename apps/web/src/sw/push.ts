/* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- an empty string from the server falls back like a missing one */
/** Push handlers: show the server's PushMessage `{ title, body, url, tag }`
 * as a notification, and open its page on click. */
import { APP_NAME } from "../lib/constants.ts";

declare const self: ServiceWorkerGlobalScope;

type PushData = { title?: string; body?: string; url?: string; tag?: string };

function readPushData(event: PushEvent): PushData {
	if (!event.data) return {};
	const text = event.data.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { body: text };
	}
	if (data === null) return { body: "" };
	if (typeof data === "object") return data;
	return { body: typeof data === "string" ? data : JSON.stringify(data) };
}

/** The notification's url resolved against this origin; anything
 * cross-origin or unparseable falls back to the app root. */
function sameOriginTarget(raw: string | undefined): string {
	try {
		const url = new URL(raw || "/", self.location.origin);
		if (url.origin === self.location.origin) return url.href;
	} catch {
		// fall through to the root
	}
	return new URL("/", self.location.origin).href;
}

/** Focuses an open app window and sends it to `target`, or opens a new
 * window there. */
async function openTarget(target: string): Promise<void> {
	const windows = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	for (const client of windows) {
		try {
			if (new URL(client.url).origin !== self.location.origin) continue;
			await client.focus();
			if ("navigate" in client) await client.navigate(target);
			return;
		} catch {
			// this window is unusable; try the next, then open a new one
		}
	}
	await self.clients.openWindow(target);
}

export function registerPushHandlers(): void {
	self.addEventListener("push", (event) => {
		const data = readPushData(event);
		event.waitUntil(
			self.registration.showNotification(data.title || APP_NAME, {
				body: data.body || "",
				tag: data.tag,
				icon: "/pwa-192x192.png",
				badge: "/pwa-64x64.png",
				data: { url: data.url || "/" },
			})
		);
	});

	self.addEventListener("notificationclick", (event) => {
		event.notification.close();
		const data = event.notification.data as { url?: string } | undefined;
		event.waitUntil(openTarget(sameOriginTarget(data?.url)));
	});
}
