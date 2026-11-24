import { apiBase } from "./config.ts";

export type Manifest = {
	version: number;
	transition: "fade" | "slide" | "none";
	/** The built pack's version; null before one exists, absent on an older backend. */
	packVersion?: number | null;
	slides: {
		id: string;
		kind: "image" | "html";
		durationSec: number;
		rev: number;
		src: string;
	}[];
};

export type PackDownload = {
	zip: Uint8Array;
	/** The version the server built this zip at (`X-Tv-Pack-Version`); undefined when the header is absent or not a number. */
	version: number | undefined;
};

export type PairingStart = {
	code: string;
	pollSecret: string;
	expiresAt: number;
};

export type PairingPoll =
	| { status: "pending" }
	| { status: "paired"; token: string }
	| { status: "expired" | "unknown" };

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

const SLIDE_PATH = "/tv/slide";

function url(path: string): string {
	return `${apiBase()}${path}`;
}

/** A manifest `src` is data from the network: only a slide path on the API's own origin may carry the token. */
function slideUrl(source: string): string | undefined {
	const base = new URL(apiBase());
	try {
		const resolved = new URL(source, base);
		const isOwn =
			resolved.origin === base.origin &&
			resolved.pathname.startsWith(SLIDE_PATH);
		return isOwn ? resolved.href : undefined;
	} catch {
		return undefined;
	}
}

/** A manifest, slide or pairing request that has not finished by now is a network error: a half-open connection never fails on its own. */
const REQUEST_TIMEOUT_MS = 30_000;
const MS_PER_MINUTE = 60_000;
const PACK_TIMEOUT_MINUTES = 5;
/** The pack is up to 40 MiB: five minutes is about 1 Mbit/s, below that the TV could not keep up with edits anyway. */
const PACK_TIMEOUT_MS = PACK_TIMEOUT_MINUTES * MS_PER_MINUTE;

/**
 * Runs `run` with a signal that aborts after `ms` or when `outer` (the
 * caller's stop signal) aborts. The timer covers reading the body too, since
 * `run` does that. Not AbortSignal.timeout (Chrome 103; the TV runs 76). The
 * timer and listener are released on every path.
 */
async function withTimeout<T>(
	ms: number,
	outer: AbortSignal | undefined,
	run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
	const controller = new AbortController();
	function abort(): void {
		controller.abort();
	}
	if (outer?.aborted) abort();
	outer?.addEventListener("abort", abort);
	const timer = setTimeout(abort, ms);
	try {
		return await run(controller.signal);
	} finally {
		clearTimeout(timer);
		outer?.removeEventListener("abort", abort);
	}
}

function bearer(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

export async function startPairing(): Promise<PairingStart> {
	return withTimeout(REQUEST_TIMEOUT_MS, undefined, async (signal) => {
		const response = await fetch(url("/tv/pair/start"), {
			method: "POST",
			signal,
		});
		if (!response.ok)
			throw new Error(`pair start failed: ${response.status}`);
		return (await response.json()) as PairingStart;
	});
}

/** `expired` and `unknown` come back as 410 and 404 with a status body; anything else non-2xx throws. */
export async function pollPairing(pollSecret: string): Promise<PairingPoll> {
	return withTimeout(REQUEST_TIMEOUT_MS, undefined, async (signal) => {
		const response = await fetch(url("/tv/pair/poll"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ pollSecret }),
			signal,
		});
		if (
			response.ok ||
			response.status === HTTP_GONE ||
			response.status === HTTP_NOT_FOUND
		) {
			return (await response.json()) as PairingPoll;
		}
		throw new Error(`pair poll failed: ${response.status}`);
	});
}

/** `stop` aborts the request (the caller was stopped); it also aborts after the request timeout. */
export async function fetchManifest(
	token: string,
	stop?: AbortSignal
): Promise<Manifest | "unauthorized"> {
	return withTimeout(REQUEST_TIMEOUT_MS, stop, async (signal) => {
		const response = await fetch(url("/tv/manifest"), {
			headers: bearer(token),
			signal,
		});
		if (response.status === HTTP_UNAUTHORIZED) return "unauthorized";
		if (!response.ok)
			throw new Error(`manifest failed: ${response.status}`);
		return (await response.json()) as Manifest;
	});
}

/** `missing` is a slide that is gone (404) or whose `src` points outside the API; the caller skips it. */
export async function fetchSlide(
	token: string,
	source: string,
	stop?: AbortSignal
): Promise<Blob | "unauthorized" | "missing"> {
	const target = slideUrl(source);
	if (target === undefined) return "missing";
	return withTimeout(REQUEST_TIMEOUT_MS, stop, async (signal) => {
		const response = await fetch(target, {
			headers: bearer(token),
			signal,
		});
		if (response.status === HTTP_UNAUTHORIZED) return "unauthorized";
		if (response.status === HTTP_NOT_FOUND) return "missing";
		if (!response.ok) throw new Error(`slide failed: ${response.status}`);
		return response.blob();
	});
}

const PACK_PATH = "/tv/pack";
const PACK_VERSION_HEADER = "X-Tv-Pack-Version";

/**
 * The whole pack; `missing` until the server has built one. The version comes
 * from the response header, not the manifest: a rebuild can land between the
 * two requests, and the zip is what was actually downloaded. `stop` aborts
 * the download (the caller was stopped); it also aborts after the pack timeout.
 */
export async function fetchPack(
	token: string,
	stop?: AbortSignal
): Promise<PackDownload | "unauthorized" | "missing"> {
	return withTimeout(PACK_TIMEOUT_MS, stop, async (signal) => {
		const response = await fetch(url(PACK_PATH), {
			headers: bearer(token),
			signal,
		});
		if (response.status === HTTP_UNAUTHORIZED) return "unauthorized";
		if (response.status === HTTP_NOT_FOUND) return "missing";
		if (!response.ok) throw new Error(`pack failed: ${response.status}`);
		const header = response.headers.get(PACK_VERSION_HEADER);
		const version =
			header === null || header.trim() === ""
				? Number.NaN
				: Number(header);
		return {
			zip: new Uint8Array(await response.arrayBuffer()),
			version: Number.isInteger(version) ? version : undefined,
		};
	});
}
