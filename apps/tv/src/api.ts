import { apiBase } from "./config.ts";

export type Manifest = {
	version: number;
	transition: "fade" | "slide" | "none";
	slides: {
		id: string;
		kind: "image" | "html";
		durationSec: number;
		rev: number;
		src: string;
	}[];
};

export type PairingStart = { code: string; pollSecret: string; expiresAt: number };

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
		const isOwn = resolved.origin === base.origin && resolved.pathname.startsWith(SLIDE_PATH);
		return isOwn ? resolved.href : undefined;
	} catch {
		return undefined;
	}
}

function bearer(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

export async function startPairing(): Promise<PairingStart> {
	const response = await fetch(url("/tv/pair/start"), { method: "POST" });
	if (!response.ok) throw new Error(`pair start failed: ${response.status}`);
	return (await response.json()) as PairingStart;
}

/** `expired` and `unknown` come back as 410 and 404 with a status body; anything else non-2xx throws. */
export async function pollPairing(pollSecret: string): Promise<PairingPoll> {
	const response = await fetch(url("/tv/pair/poll"), {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ pollSecret }),
	});
	if (response.ok || response.status === HTTP_GONE || response.status === HTTP_NOT_FOUND) {
		return (await response.json()) as PairingPoll;
	}
	throw new Error(`pair poll failed: ${response.status}`);
}

export async function fetchManifest(token: string): Promise<Manifest | "unauthorized"> {
	const response = await fetch(url("/tv/manifest"), { headers: bearer(token) });
	if (response.status === HTTP_UNAUTHORIZED) return "unauthorized";
	if (!response.ok) throw new Error(`manifest failed: ${response.status}`);
	return (await response.json()) as Manifest;
}

/** `missing` is a slide that is gone (404) or whose `src` points outside the API; the caller skips it. */
export async function fetchSlide(token: string, source: string): Promise<Blob | "unauthorized" | "missing"> {
	const target = slideUrl(source);
	if (target === undefined) return "missing";
	const response = await fetch(target, { headers: bearer(token) });
	if (response.status === HTTP_UNAUTHORIZED) return "unauthorized";
	if (response.status === HTTP_NOT_FOUND) return "missing";
	if (!response.ok) throw new Error(`slide failed: ${response.status}`);
	return response.blob();
}
