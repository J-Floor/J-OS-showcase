/**
 * The app's service worker (vite-plugin-pwa `injectManifest`). It precaches
 * the build, serves it offline with an `index.html` fallback for deep links,
 * takes over open tabs as soon as it installs, and reports install progress
 * to the "Updating the app…" overlay.
 */
import { clientsClaim } from "workbox-core";
import {
	cleanupOutdatedCaches,
	PrecacheController,
	PrecacheRoute,
	type PrecacheEntry,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

import {
	precacheProgressMessage,
	UPDATE_CHANNEL,
} from "../lib/updateProgress.ts";

import {
	PRECACHE_CONCURRENCY,
	precacheInParallel,
} from "./precacheInParallel.ts";
import { registerPushHandlers } from "./push.ts";
import { registerReloadOnUpdate } from "./reloadOnUpdate.ts";

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: (PrecacheEntry | string)[];
};

// Static directories also listed in `globIgnores` in vite.config.ts; add a new one to both.
const NAVIGATION_DENYLIST = [/^\/agreements\//, /^\/email\//];

const manifest: PrecacheEntry[] = self.__WB_MANIFEST.map((entry) =>
	typeof entry === "string" ? { url: entry, revision: null } : entry
);

const precache = new PrecacheController();
precache.addToCacheList(manifest);

function requestFor(entry: PrecacheEntry): Request {
	return new Request(entry.url, {
		integrity: entry.integrity,
		cache: entry.revision ? "reload" : "default",
		credentials: "same-origin",
	});
}

async function install(event: ExtendableEvent): Promise<void> {
	const cache = await self.caches.open(precache.strategy.cacheName);
	const channel =
		typeof BroadcastChannel === "undefined"
			? undefined
			: new BroadcastChannel(UPDATE_CHANNEL);
	await precacheInParallel({
		entries: manifest,
		isCached: async (entry) => {
			const cacheKey = precache.getCacheKeyForURL(entry.url);
			return Boolean(cacheKey && (await cache.match(cacheKey)));
		},
		fetchOne: async (entry) => {
			const cacheKey = precache.getCacheKeyForURL(entry.url);
			await Promise.all(
				precache.strategy.handleAll({
					params: { cacheKey },
					request: requestFor(entry),
					event,
				})
			);
		},
		concurrency: PRECACHE_CONCURRENCY,
		onProgress: (progress) => {
			channel?.postMessage(precacheProgressMessage(progress));
		},
	}).finally(() => {
		channel?.close();
	});
}

self.addEventListener("install", (event) => {
	void self.skipWaiting();
	event.waitUntil(install(event));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(precache.activate(event));
});
clientsClaim();
cleanupOutdatedCaches();

registerRoute(new PrecacheRoute(precache));
registerRoute(
	new NavigationRoute(precache.createHandlerBoundToURL("index.html"), {
		denylist: NAVIGATION_DENYLIST,
	})
);

registerPushHandlers();
registerReloadOnUpdate();
