/*
 * Push handlers, pulled into the generated service worker by
 * `workbox.importScripts` (vite.config.ts). Plain JS, served as-is from
 * /push-sw.js. The Cloudflare rule bypasses the cache for non-/assets paths,
 * so it updates with each deploy. The payload is the server's PushMessage:
 * { title, body, url, tag }.
 */
self.addEventListener("push", (event) => {
	let data;
	try {
		data = event.data ? event.data.json() : {};
	} catch {
		data = { body: event.data ? event.data.text() : "" };
	}
	if (typeof data !== "object" || data === null) {
		data = { body: String(data ?? "") };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "J floor", {
			body: data.body || "",
			tag: data.tag,
			icon: "/pwa-192x192.png",
			badge: "/pwa-64x64.png",
			data: { url: data.url || "/" },
		})
	);
});

/* Resolve the notification's url against this origin; anything cross-origin
   or unparseable falls back to the app root. */
function sameOriginTarget(raw) {
	try {
		const u = new URL(raw || "/", self.location.origin);
		if (u.origin === self.location.origin) return u.href;
	} catch {
		// fall through to the root
	}
	return new URL("/", self.location.origin).href;
}

/* Focus an open app window and send it to the notification's page, or open a
   new window there. */
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = sameOriginTarget(
		event.notification.data && event.notification.data.url
	);
	event.waitUntil(
		(async () => {
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
		})()
	);
});
