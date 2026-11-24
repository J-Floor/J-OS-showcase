import type { Player, PlayerSlide } from "@j-os/tv-player";

import { fetchManifest, fetchPack, fetchSlide, type Manifest } from "./api.ts";
import { loadPack, type ImageCache, type LoadedPack } from "./pack.ts";
import { storage } from "./storage.ts";

const MANIFEST_MS = 60_000;
/** A pack that failed to load is not fetched again for this long, then double, up to the cap (a 40 MiB download a minute would be 2.4 GB an hour). */
const RETRY_FIRST_MINUTES = 5;
const RETRY_MAX_MINUTES = 60;
const RETRY_FIRST_MS = RETRY_FIRST_MINUTES * MANIFEST_MS;
const RETRY_MAX_MS = RETRY_MAX_MINUTES * MANIFEST_MS;

export type SyncOptions = {
	token: string;
	root: HTMLElement;
	player: Pick<Player, "setSlides" | "setTransition">;
	onUnauthorized: () => void;
};

export type Sync = { stop: () => void };

type Entry = { rev: number; slide: PlayerSlide };

function revoke(entry: Entry): void {
	if (entry.slide.imageUrl?.startsWith("blob:"))
		URL.revokeObjectURL(entry.slide.imageUrl);
}

function buildIdleScreen(): HTMLElement {
	const idle = document.createElement("div");
	idle.className = "screen idle";
	idle.hidden = true;
	const message = document.createElement("p");
	message.className = "message";
	message.textContent = "Nothing to show yet";
	idle.append(message);
	return idle;
}

async function download(
	token: string,
	slide: Manifest["slides"][number],
	signal: AbortSignal
): Promise<Entry | "unauthorized" | "missing"> {
	const blob = await fetchSlide(token, slide.src, signal);
	if (blob === "unauthorized" || blob === "missing") return blob;
	const base = {
		id: slide.id,
		kind: slide.kind,
		durationSec: slide.durationSec,
	};
	return {
		rev: slide.rev,
		slide:
			slide.kind === "html"
				? { ...base, html: await blob.text() }
				: { ...base, imageUrl: URL.createObjectURL(blob) },
	};
}

type State = {
	isStopped: boolean;
	timer: ReturnType<typeof setTimeout> | undefined;
	version: number | undefined;
	/** What the player shows now, by slide id. */
	current: Map<string, Entry>;
	/** Slides fetched for a manifest that did not finish; kept so a retry does not refetch them. */
	fetched: Map<string, Entry>;
	/** The version of the pack the player shows; undefined while it plays the slide list. */
	packVersion: number | undefined;
	/** The blob: URLs of that pack's image slides. */
	packUrls: string[];
	/** What those URLs were made from, so the next pack reuses the ones whose image did not change. */
	packImages: ImageCache | undefined;
	/** The pack version that last failed to load, how many times in a row, and when it may be fetched again. */
	failedPack:
		| { version: number; attempts: number; retryAt: number }
		| undefined;
	/** Aborts a pack download in flight when the sync stops. */
	abort: AbortController;
};

/** A cached slide at the same `rev`, else a fresh download: the API allows 600 requests an hour per device. */
async function resolve(
	options: SyncOptions,
	state: State,
	slide: Manifest["slides"][number]
): Promise<Entry | "unauthorized" | "missing"> {
	const cached = [state.fetched.get(slide.id), state.current.get(slide.id)];
	const known = cached.find((entry) => entry?.rev === slide.rev);
	if (known) return known;
	const entry = await download(options.token, slide, state.abort.signal);
	if (entry === "unauthorized" || entry === "missing") return entry;
	if (state.isStopped) {
		revoke(entry);
		return entry;
	}
	const replaced = state.fetched.get(slide.id);
	if (replaced && replaced !== entry) revoke(replaced);
	state.fetched.set(slide.id, entry);
	return entry;
}

/** Shows the manifest's slides; false when the token was refused. A deleted slide (404) is skipped; any other failed fetch throws and changes nothing. */
async function applyManifest(
	options: SyncOptions,
	state: State,
	idle: HTMLElement,
	manifest: Manifest
): Promise<boolean> {
	const next = new Map<string, Entry>();
	for (const slide of manifest.slides) {
		if (state.isStopped) return true;
		const entry = await resolve(options, state, slide);
		if (entry === "unauthorized") return false;
		if (entry === "missing") continue;
		next.set(slide.id, entry);
	}
	if (state.isStopped) return true;
	const kept = new Set(next.values());
	const unused = new Set(allEntries(state));
	for (const entry of kept) unused.delete(entry);
	state.current = next;
	state.fetched = new Map();
	options.player.setTransition(manifest.transition);
	options.player.setSlides([...kept].map((entry) => entry.slide));
	idle.hidden = next.size > 0;
	for (const entry of unused) revoke(entry);
	revokeAll(state.packUrls);
	state.packUrls = [];
	state.packImages = undefined;
	state.packVersion = undefined;
	state.version = manifest.version;
	return true;
}

function revokeAll(urls: readonly string[]): void {
	for (const url of urls) URL.revokeObjectURL(url);
}

function allEntries(state: State): Entry[] {
	return [...state.current.values(), ...state.fetched.values()];
}

/** Revokes the blob: URLs of every slide-list entry the sync holds (shown or fetched ahead). */
function revokeEntries(state: State): void {
	for (const entry of allEntries(state)) revoke(entry);
}

/** True while `version` failed to load and its backoff has not run out. A different version is never held back. */
function isBackedOff(state: State, version: number): boolean {
	const failed = state.failedPack;
	if (failed?.version !== version) return false;
	const remaining = failed.retryAt - Date.now();
	// A wait longer than the maximum means the clock went back since it was set.
	return remaining > 0 && remaining <= RETRY_MAX_MS;
}

function recordFailure(state: State, version: number): void {
	const previous =
		state.failedPack?.version === version ? state.failedPack.attempts : 0;
	const delay = Math.min(RETRY_FIRST_MS * 2 ** previous, RETRY_MAX_MS);
	state.failedPack = {
		version,
		attempts: previous + 1,
		retryAt: Date.now() + delay,
	};
}

/**
 * Plays the pack the server advertises as `advertised`; false when the token
 * was refused. A pack not built yet (404) changes nothing and is asked for
 * again next minute. Anything else that goes wrong (a network error or timeout,
 * a 5xx, a pack that cannot be built, a throw from the player) changes nothing
 * on screen (the last good pack keeps playing), revokes the URLs of the pack
 * it just built, and is not retried until a new version or an exponential
 * backoff. The stored version is the one the download came with: a rebuild may
 * have landed after the manifest was read. A failure is recorded under that
 * version too when it is known.
 */
async function applyPack(
	options: SyncOptions,
	state: State,
	idle: HTMLElement,
	advertised: number
): Promise<boolean> {
	let version = advertised;
	let built: LoadedPack | undefined;
	try {
		const download = await fetchPack(options.token, state.abort.signal);
		if (download === "unauthorized") return false;
		if (download === "missing" || state.isStopped) return true;
		version = download.version ?? advertised;
		const pack = loadPack(download.zip, state.packImages);
		built = pack;
		options.player.setTransition(pack.transition);
		options.player.setSlides(pack.slides);
		idle.hidden = pack.slides.length > 0;
		const kept = new Set(pack.objectUrls);
		revokeAll(state.packUrls.filter((url) => !kept.has(url)));
		revokeEntries(state);
		state.current = new Map();
		state.fetched = new Map();
		state.packUrls = pack.objectUrls;
		state.packImages = pack.images;
		state.packVersion = version;
		// The legacy manifest version no longer describes what plays: a later
		// legacy answer with the same number must still be applied.
		state.version = undefined;
		state.failedPack = undefined;
		return true;
	} catch {
		if (built !== undefined) {
			// Only what this load made: a reused URL still belongs to the pack on screen.
			const shown = new Set(state.packUrls);
			revokeAll(built.objectUrls.filter((url) => !shown.has(url)));
		}
		recordFailure(state, version);
		return true;
	}
}

/**
 * Polls the manifest once a minute. With a pack (`packVersion`), downloads it only when that changes; otherwise refetches only slides whose `rev` changed. A failure keeps the last good slides playing.
 */
export function runSync(options: SyncOptions): Sync {
	const idle = buildIdleScreen();
	options.root.append(idle);
	const state: State = {
		isStopped: false,
		timer: undefined,
		version: undefined,
		current: new Map(),
		fetched: new Map(),
		packVersion: undefined,
		packUrls: [],
		packImages: undefined,
		failedPack: undefined,
		abort: new AbortController(),
	};

	function expire(): void {
		state.isStopped = true;
		storage.clearToken();
		options.onUnauthorized();
	}

	async function tick(): Promise<void> {
		try {
			const manifest = await fetchManifest(
				options.token,
				state.abort.signal
			);
			if (state.isStopped) return;
			if (manifest === "unauthorized") {
				expire();
				return;
			}
			// `packVersion: null` (the server has no pack, e.g. after it was
			// removed) switches the TV back to the slide list, and revokes the
			// pack's images. The server's own comment says null "keeps a TV on
			// what it plays"; this is the chosen behaviour: a TV must follow what
			// the board sees, and the legacy list is always current.
			const packVersion = manifest.packVersion;
			const isApplied =
				typeof packVersion === "number"
					? packVersion === state.packVersion ||
						isBackedOff(state, packVersion) ||
						(await applyPack(options, state, idle, packVersion))
					: manifest.version === state.version ||
						(await applyManifest(options, state, idle, manifest));
			if (!isApplied) {
				expire();
				return;
			}
		} catch {
			// Offline or rate limited: the last good slides keep playing.
		}
		if (!state.isStopped)
			state.timer = setTimeout(() => void tick(), MANIFEST_MS);
	}

	void tick();
	return {
		stop: () => {
			state.isStopped = true;
			state.abort.abort();
			clearTimeout(state.timer);
			revokeEntries(state);
			revokeAll(state.packUrls);
		},
	};
}
