/**
 * Reloads open tabs onto the new build once this worker takes over. A tab
 * opened before a deploy runs the old bundle, which may have no reload code
 * of its own (or missed the update), so the worker drives the reload. A
 * first install never reloads: those pages came from the network and are
 * already current.
 *
 * The navigations are fired, not awaited. While this worker is still
 * activating, fetches to it wait until it is activated, and it stays
 * activating until the `waitUntil` promise settles. `navigate()` settles
 * only after the navigation's fetch, which goes to this worker, so awaiting
 * it would deadlock until the browser gives up.
 */

declare const self: ServiceWorkerGlobalScope;

function ignore(): void {
	// a refused navigation leaves that tab on the old build; nothing to do
}

export function registerReloadOnUpdate(): void {
	let isUpdate = false;

	self.addEventListener("install", () => {
		isUpdate = Boolean(self.registration.active);
	});

	self.addEventListener("activate", (event) => {
		if (!isUpdate) return;
		event.waitUntil(
			self.clients
				.claim()
				.then(() => self.clients.matchAll({ type: "window" }))
				.then((clients) => {
					for (const client of clients)
						client.navigate(client.url).catch(ignore);
				})
		);
	});
}
