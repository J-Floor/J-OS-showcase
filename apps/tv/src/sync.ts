import type { Player, PlayerSlide } from "@j-os/tv-player";

import { fetchManifest, fetchPack, fetchSlide, type Manifest } from "./api.ts";
import { createBackoff, type Backoff } from "./backoff.ts";
import { loadPack, type ImageCache, type LoadedPack } from "./pack.ts";
import type { Schedule } from "./schedule.ts";
import { createScheduleSync } from "./scheduleSync.ts";
import { storage } from "./storage.ts";

const MANIFEST_MS = 60_000;

export type SyncOptions = {
	token: string;
	root: HTMLElement;
	player: Pick<Player, "setSlides" | "setTransition">;
	onUnauthorized: () => void;
	/** The device's power schedule: the stored one at start, then each change; undefined when it has none. */
	onSchedule?: (schedule: Schedule | undefined) => void;
	/** Called after each manifest the server answered (not after a 401), so the caller can re-check what depends on the wall clock. */
	onTick?: () => void;
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
	/** The pack version that last failed to load and when it may be fetched again (a 40 MiB download a minute would be 2.4 GB an hour). */
	failedPack: Backoff;
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
		state.failedPack.clear();
		return true;
	} catch {
		// A stop (its abort throws here) is not a pack failure.
		if (state.isStopped) return true;
		if (built !== undefined) {
			// Only what this load made: a reused URL still belongs to the pack on screen.
			const shown = new Set(state.packUrls);
			revokeAll(built.objectUrls.filter((url) => !shown.has(url)));
		}
		state.failedPack.recordFailure(version);
		return true;
	}
}

/** Plays what the manifest advertises: the pack when it has a version, else the slide list. False when the token was refused. */
async function applyContent(
	options: SyncOptions,
	state: State,
	idle: HTMLElement,
	manifest: Manifest
): Promise<boolean> {
	// `packVersion: null` (the server has no pack, e.g. after it was
	// removed) switches the TV back to the slide list, and revokes the
	// pack's images. The server's own comment says null "keeps a TV on
	// what it plays"; this is the chosen behaviour: a TV must follow what
	// the board sees, and the legacy list is always current.
	const packVersion = manifest.packVersion;
	return typeof packVersion === "number"
		? packVersion === state.packVersion ||
				state.failedPack.isBackedOff(packVersion) ||
				(await applyPack(options, state, idle, packVersion))
		: manifest.version === state.version ||
				(await applyManifest(options, state, idle, manifest));
}

/**
 * Polls the manifest once a minute. With a pack (`packVersion`), downloads it only when that changes; otherwise refetches only slides whose `rev` changed. A failure keeps the last good slides playing.
 */
export function runSync(options: SyncOptions): Sync {
	const idle = buildIdleScreen();
	options.root.append(idle);
	const schedule = createScheduleSync({
		onSchedule: (value) => options.onSchedule?.(value),
	});
	const state: State = {
		isStopped: false,
		timer: undefined,
		version: undefined,
		current: new Map(),
		fetched: new Map(),
		packVersion: undefined,
		packUrls: [],
		packImages: undefined,
		failedPack: createBackoff({}),
		abort: new AbortController(),
	};

	/** A function, so the check after an await is not narrowed by the one before it. */
	function isStopped(): boolean {
		return state.isStopped;
	}

	function expire(): void {
		state.isStopped = true;
		storage.clearToken();
		storage.clearSchedule();
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
			// Concurrent, so a slow schedule fetch never delays the slides. Each
			// step's throw is its own: it must not skip the other or the re-arm.
			const [isContentOk, isScheduleOk] = await Promise.all([
				applyContent(options, state, idle, manifest).catch(() => true),
				schedule
					.onManifest(
						manifest.scheduleVersion,
						options.token,
						state.abort.signal
					)
					.catch(() => true),
			]);
			if (isStopped()) return;
			if (!isContentOk || !isScheduleOk) {
				expire();
				return;
			}
			options.onTick?.();
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
