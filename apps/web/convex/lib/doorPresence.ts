// Presence proof for app-unlock: an unlock must come from the building
// network. Pure — no Convex, no env reads — so the `/door/presence` oracle and
// the `unlockDoor` action share one implementation. Web Crypto only
// (`crypto.subtle`), which both the default and the Node runtime provide.
import { parseCsv } from "./csv.ts";

/** How long a minted presence token stays valid. Long enough to cover the
 *  oracle round trip plus the unlock call; short enough that a token copied off
 *  the building network is useless almost immediately. */
export const PRESENCE_TTL_MS = 30_000;

/** The oracle's route, shared by `http.ts` (where it is registered) and
 *  `src/modules/space/presence.ts` (where it is fetched) so the path is
 *  written once instead of matched by hand in two places. */
export const PRESENCE_PATH = "/door/presence";

type ParsedIp = { v6: boolean; value: bigint };

/** Split the comma-separated `DOOR_BUILDING_IP` env var into trimmed entries. */
export function parseCidrs(raw: string | undefined): string[] {
	return parseCsv(raw);
}

function parseV4(ip: string): bigint | undefined {
	const parts = ip.split(".");
	if (parts.length !== 4) return undefined;
	let value = 0n;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return undefined;
		const n = Number(part);
		if (n > 255) return undefined;
		value = (value << 8n) | BigInt(n);
	}
	return value;
}

function parseV6(ip: string): ParsedIp | undefined {
	// An IPv4-mapped address (::ffff:a.b.c.d) is really the IPv4 address.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) {
		const v4 = parseV4(mapped[1]);
		return v4 === undefined ? undefined : { v6: false, value: v4 };
	}
	const halves = ip.split("::");
	if (halves.length > 2) return undefined;
	const head = halves[0] === "" ? [] : halves[0].split(":");
	const tail =
		halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
	const fill = halves.length === 2 ? missing : 0;
	const groups = [...head, ...new Array<string>(fill).fill("0"), ...tail];
	let value = 0n;
	for (const group of groups) {
		if (!/^[0-9a-f]{1,4}$/i.test(group)) return undefined;
		value = (value << 16n) | BigInt(parseInt(group, 16));
	}
	return { v6: true, value };
}

function parseIp(raw: string): ParsedIp | undefined {
	const ip = raw.trim();
	if (ip.includes(":")) return parseV6(ip);
	const v4 = parseV4(ip);
	return v4 === undefined ? undefined : { v6: false, value: v4 };
}

/**
 * Whether `ip` falls inside any entry of `cidrs` (an address, or an address
 * with a `/prefix`). IPv4 and IPv6 never match each other. Malformed input on
 * either side never matches — the guard fails closed.
 */
export function ipInCidrs(ip: string, cidrs: string[]): boolean {
	const addr = parseIp(ip);
	if (!addr) return false;
	return cidrs.some((cidr) => {
		const segments = cidr.trim().split("/");
		if (segments.length > 2) return false;
		const [base, prefix] = segments as [string, string | undefined];
		const net = parseIp(base);
		if (net?.v6 !== addr.v6) return false;
		const width = addr.v6 ? 128 : 32;
		if (prefix !== undefined && !/^\d{1,3}$/.test(prefix)) return false;
		const len = prefix === undefined ? width : Number(prefix);
		if (!Number.isInteger(len) || len < 0 || len > width) return false;
		const shift = BigInt(width - len);
		return addr.value >> shift === net.value >> shift;
	});
}

function toB64url(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^[A-Za-z0-9_-]+$/.test(s)) return undefined;
	// A base64 string one char past a 4-char group (length % 4 === 1) is not
	// decodable, and `atob` throws on it. A garbage token must read as
	// "invalid", never escape as an internal error.
	let bin: string;
	try {
		bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
	} catch {
		return undefined;
	}
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		[usage]
	);
}

/** A token proving "this request came from the building network", valid for
 *  {@link PRESENCE_TTL_MS}. Carries no identity — who is unlocking is checked
 *  separately by the unlock action. Format: `b64url(payload).b64url(hmac)`. */
export async function mintPresenceToken(
	secret: string,
	nowMs: number
): Promise<string> {
	const payload = new TextEncoder().encode(
		JSON.stringify({ exp: nowMs + PRESENCE_TTL_MS })
	);
	const sig = new Uint8Array(
		await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), payload)
	);
	return `${toB64url(payload)}.${toB64url(sig)}`;
}

/** True only for a token this secret signed that has not yet expired.
 *  `crypto.subtle.verify` compares in constant time. */
export async function verifyPresenceToken(
	secret: string,
	token: string,
	nowMs: number
): Promise<boolean> {
	const parts = token.split(".");
	if (parts.length !== 2) return false;
	const payload = fromB64url(parts[0]);
	const sig = fromB64url(parts[1]);
	if (!payload || !sig) return false;
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret, "verify"),
		sig,
		payload
	);
	if (!valid) return false;
	let exp: unknown;
	try {
		exp = (
			JSON.parse(new TextDecoder().decode(payload)) as { exp?: unknown }
		).exp;
	} catch {
		return false;
	}
	return typeof exp === "number" && nowMs < exp;
}

/**
 * Whether the building-IP match is enforced, from `DOOR_PRESENCE_IP_CHECK`.
 * On unless the value is exactly `"off"` — a typo or an unset variable keeps
 * the guard up. With it off the token no longer proves the building network,
 * the request may come from outside the building (the token, access gate,
 * debounce and audit log still apply).
 */
export function ipCheckEnabled(raw: string | undefined): boolean {
	return raw !== "off";
}

/**
 * The oracle's decision. Fails closed: no secret, no client IP, or an IP
 * outside the building network → 403 and no token. With `ipCheck` false only
 * the IP match is skipped; a missing secret still refuses.
 */
export async function presenceResponse(args: {
	clientIp: string | null;
	buildingCidrs: string[];
	secret: string | undefined;
	ipCheck: boolean;
	nowMs: number;
}): Promise<{ status: 200; token: string } | { status: 403 }> {
	if (!args.secret) return { status: 403 };
	if (
		args.ipCheck &&
		(args.clientIp === null ||
			!ipInCidrs(args.clientIp, args.buildingCidrs))
	)
		return { status: 403 };
	return {
		status: 200,
		token: await mintPresenceToken(args.secret, args.nowMs),
	};
}

/**
 * The `/door/presence` route body, pulled out of `http.ts` so it can be
 * exercised directly in tests instead of only through a live httpAction.
 *
 * The client IP is read ONLY from the `cf-connecting-ip` header. Convex's HTTP
 * edge is Cloudflare, which sets that header to the real client address and
 * rejects a client-supplied copy; a client-supplied `x-forwarded-for` is never
 * consulted, on-site or not.
 */
export async function presenceHttpResponse(
	req: Request,
	env: {
		buildingIp: string | undefined;
		secret: string | undefined;
		siteUrl: string | undefined;
		/** Raw `DOOR_PRESENCE_IP_CHECK`; see {@link ipCheckEnabled}. */
		ipCheck: string | undefined;
	},
	nowMs: number
): Promise<Response> {
	const result = await presenceResponse({
		clientIp: req.headers.get("cf-connecting-ip"),
		buildingCidrs: parseCidrs(env.buildingIp),
		secret: env.secret,
		ipCheck: ipCheckEnabled(env.ipCheck),
		nowMs,
	});
	return new Response(
		JSON.stringify(
			result.status === 200
				? { token: result.token }
				: { error: "off-site" }
		),
		{
			status: result.status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				"Access-Control-Allow-Origin": env.siteUrl ?? "",
				Vary: "Origin",
			},
		}
	);
}
