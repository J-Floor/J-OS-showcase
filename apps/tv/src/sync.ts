import type { Player, PlayerSlide } from "@j-os/tv-player";

import { fetchManifest, fetchSlide, type Manifest } from "./api.ts";
import { storage } from "./storage.ts";

const MANIFEST_MS = 60_000;

export type SyncOptions = {
	token: string;
	root: HTMLElement;
	player: Pick<Player, "setSlides" | "setTransition">;
	onUnauthorized: () => void;
};

export type Sync = { stop: () => void };

type Entry = { rev: number; slide: PlayerSlide };

function revoke(entry: Entry): void {
	if (entry.slide.imageUrl?.startsWith("blob:")) URL.revokeObjectURL(entry.slide.imageUrl);
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

async function download(token: string, slide: Manifest["slides"][number]): Promise<Entry | "unauthorized" | "missing"> {
	const blob = await fetchSlide(token, slide.src);
	if (blob === "unauthorized" || blob === "missing") return blob;
	const base = { id: slide.id, kind: slide.kind, durationSec: slide.durationSec };
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
	const entry = await download(options.token, slide);
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
	const unused = new Set([...state.current.values(), ...state.fetched.values()]);
	for (const entry of kept) unused.delete(entry);
	state.current = next;
	state.fetched = new Map();
	options.player.setTransition(manifest.transition);
	options.player.setSlides([...kept].map((entry) => entry.slide));
	idle.hidden = next.size > 0;
	for (const entry of unused) revoke(entry);
	state.version = manifest.version;
	return true;
}

/** Polls the manifest and refetches only slides whose `rev` changed. A failure keeps the last good slides playing. */
export function runSync(options: SyncOptions): Sync {
	const idle = buildIdleScreen();
	options.root.append(idle);
	const state: State = {
		isStopped: false,
		timer: undefined,
		version: undefined,
		current: new Map(),
		fetched: new Map(),
	};

	function expire(): void {
		state.isStopped = true;
		storage.clearToken();
		options.onUnauthorized();
	}

	async function tick(): Promise<void> {
		try {
			const manifest = await fetchManifest(options.token);
			if (state.isStopped) return;
			if (manifest === "unauthorized") {
				expire();
				return;
			}
			const isFresh = manifest.version !== state.version;
			if (isFresh && !(await applyManifest(options, state, idle, manifest))) {
				expire();
				return;
			}
		} catch {
			// Offline or rate limited: the last good slides keep playing.
		}
		if (!state.isStopped) state.timer = setTimeout(() => void tick(), MANIFEST_MS);
	}

	void tick();
	return {
		stop: () => {
			state.isStopped = true;
			clearTimeout(state.timer);
			for (const entry of [...state.current.values(), ...state.fetched.values()]) revoke(entry);
		},
	};
}
