import { TV_CORS_HEADERS, TV_LIMITS } from "./constants.ts";
import { bearerToken, hashTvSecret, newTvSecret } from "./tokens.ts";

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;

/** What the pairing handlers need from the outside world, injected so tests need no Convex. */
export type PairDeps = {
	limit: (
		name: "tvPairStart" | "tvPairPoll",
		key: string
	) => Promise<boolean>;
	start: (
		hashes: { codeHash: string; pollSecretHash: string },
		now: number
	) => Promise<boolean>;
	claim: (
		args: { pollSecretHash: string; tokenHash: string },
		now: number
	) => Promise<"pending" | "claimed" | "unknown" | "expired">;
	now: () => number;
};

const POLL_SECRET = /^[0-9a-f]{64}$/;

/** Every TV response: CORS plus `extra`; `no-store` unless `extra` says otherwise. */
function tvHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { "Cache-Control": "no-store", ...TV_CORS_HEADERS, ...extra };
}

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: tvHeaders({ "Content-Type": "application/json" }),
	});
}

function callerKey(request: Request): string {
	return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** A TV asks for a pairing: two fresh secrets, only their hashes are stored. */
export async function startPairingResponse(
	request: Request,
	deps: PairDeps
): Promise<Response> {
	if (!(await deps.limit("tvPairStart", callerKey(request))))
		return json({ error: "rate-limited" }, HTTP_TOO_MANY_REQUESTS);
	const code = newTvSecret();
	const pollSecret = newTvSecret();
	const now = deps.now();
	const isStored = await deps.start(
		{
			codeHash: await hashTvSecret(code),
			pollSecretHash: await hashTvSecret(pollSecret),
		},
		now
	);
	return isStored
		? json(
				{ code, pollSecret, expiresAt: now + TV_LIMITS.pairingTtlMs },
				HTTP_OK
			)
		: json({ error: "busy" }, HTTP_SERVICE_UNAVAILABLE);
}

function pollSecretOf(body: unknown): string | null {
	if (typeof body !== "object" || body === null || !("pollSecret" in body))
		return null;
	const { pollSecret } = body;
	return typeof pollSecret === "string" && POLL_SECRET.test(pollSecret)
		? pollSecret
		: null;
}

/** The TV polls with its poll secret; the device token is returned once, on approval. */
export async function pollPairingResponse(
	request: Request,
	deps: PairDeps
): Promise<Response> {
	if (!(await deps.limit("tvPairPoll", callerKey(request))))
		return json({ error: "rate-limited" }, HTTP_TOO_MANY_REQUESTS);
	const secret = pollSecretOf(await request.json().catch(() => null));
	if (secret === null)
		return json({ error: "bad-request" }, HTTP_BAD_REQUEST);
	const token = newTvSecret();
	const outcome = await deps.claim(
		{
			pollSecretHash: await hashTvSecret(secret),
			tokenHash: await hashTvSecret(token),
		},
		deps.now()
	);
	if (outcome === "claimed")
		return json({ status: "paired", token }, HTTP_OK);
	if (outcome === "pending") return json({ status: "pending" }, HTTP_OK);
	return json(
		{ status: outcome },
		outcome === "expired" ? HTTP_GONE : HTTP_NOT_FOUND
	);
}

export function preflightResponse(): Response {
	return new Response(null, {
		status: HTTP_NO_CONTENT,
		headers: TV_CORS_HEADERS,
	});
}

type TvManifest = {
	version: number;
	transition: "fade" | "slide" | "none";
	/** The built pack's version, only while its zip exists; null sends the TV back to the legacy slide list. */
	packVersion: number | null;
	slides: {
		id: string;
		kind: "image" | "html";
		durationSec: number;
		rev: number;
		src: string;
	}[];
};

type SlideContent =
	| { kind: "html"; htmlText: string }
	| { kind: "image"; fileId: string };

/** What the device-authenticated handlers need, injected so tests need no Convex. */
export type DeviceDeps = {
	authenticate: (tokenHash: string) => Promise<boolean>;
	limit: (name: "tvDevice", key: string) => Promise<boolean>;
	manifest: () => Promise<TvManifest>;
	pack: () => Promise<{ fileId: string; version: number } | null>;
	content: (id: string) => Promise<SlideContent | null>;
	getBlob: (fileId: string) => Promise<Blob | null>;
};

/** Slide HTML is untrusted: no scripts, no origin, nothing but inline style and https images. */
export const TV_SLIDE_CSP =
	"sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline'";

/** One response for a missing, malformed, unknown or revoked token: nothing to tell them apart. */
function unauthorized(): Response {
	return new Response(null, { status: 401, headers: TV_CORS_HEADERS });
}

/** The token hash when the request carries a live device token, else a ready response. */
async function deviceGate(
	request: Request,
	deps: DeviceDeps
): Promise<{ response: Response } | { tokenHash: string }> {
	const token = bearerToken(request);
	if (token === null) return { response: unauthorized() };
	const tokenHash = await hashTvSecret(token);
	if (!(await deps.authenticate(tokenHash)))
		return { response: unauthorized() };
	if (!(await deps.limit("tvDevice", tokenHash)))
		return {
			response: json({ error: "rate-limited" }, HTTP_TOO_MANY_REQUESTS),
		};
	return { tokenHash };
}

export async function manifestResponse(
	request: Request,
	deps: DeviceDeps
): Promise<Response> {
	const gate = await deviceGate(request, deps);
	return "response" in gate
		? gate.response
		: json(await deps.manifest(), HTTP_OK);
}

function noContent(status: number): Response {
	return new Response(null, {
		status,
		headers: tvHeaders(),
	});
}

export async function slideResponse(
	request: Request,
	deps: DeviceDeps
): Promise<Response> {
	const gate = await deviceGate(request, deps);
	if ("response" in gate) return gate.response;
	const id = new URL(request.url).searchParams.get("id");
	if (id === null) return noContent(HTTP_NOT_FOUND);
	const slide = await deps.content(id);
	if (slide === null) return noContent(HTTP_NOT_FOUND);
	if (slide.kind === "html")
		return new Response(slide.htmlText, {
			status: HTTP_OK,
			headers: tvHeaders({
				"Content-Type": "text/html; charset=utf-8",
				"Content-Security-Policy": TV_SLIDE_CSP,
				"X-Content-Type-Options": "nosniff",
				"Cache-Control": "private, no-store",
			}),
		});
	const blob = await deps.getBlob(slide.fileId);
	if (blob === null) return noContent(HTTP_NOT_FOUND);
	return new Response(blob, {
		status: HTTP_OK,
		headers: tvHeaders({
			"Content-Type": blob.type,
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "private, no-store",
		}),
	});
}

/**
 * The whole pack as one zip; 404 until the first build. Read-only, device
 * token only. A pack is at most 40 MiB (`TV_PACK_LIMITS.packMaxBytes`), under
 * Convex's 100 MiB HTTP response limit. Rate limit: a TV polls the manifest
 * every 60 s (60 requests an hour) and downloads the pack only when
 * `packVersion` changes, so one download plus the old slide fetches stay far
 * below the 600 requests an hour `tvDevice` allows, and a retry loop on a
 * failed download is capped by the same limiter.
 */
export async function packResponse(
	request: Request,
	deps: DeviceDeps
): Promise<Response> {
	const gate = await deviceGate(request, deps);
	if ("response" in gate) return gate.response;
	const pack = await deps.pack();
	const blob = pack === null ? null : await deps.getBlob(pack.fileId);
	if (pack === null || blob === null) return noContent(HTTP_NOT_FOUND);
	return new Response(blob, {
		status: HTTP_OK,
		headers: tvHeaders({
			"Content-Type": "application/zip",
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "private, no-store",
			"X-Tv-Pack-Version": String(pack.version),
			// Browsers hide non-safelisted response headers from scripts otherwise.
			"Access-Control-Expose-Headers": "X-Tv-Pack-Version",
		}),
	});
}
