// Presence proof for app-unlock: an unlock must come from the building
// network. Pure — no Convex, no env reads — so the `/door/presence` oracle and
// the `unlockDoor` action share one implementation. Web Crypto only
// (`crypto.subtle`), which both the default and the Node runtime provide.
import { HEX_RADIX } from "./constants.ts";
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

const IPV4_PARTS = 4;
const IPV4_MAX_OCTET = 255;
const IPV4_OCTET_BITS = 8n;
const IPV4_BITS = 32;
const IPV6_GROUPS = 8;
const IPV6_GROUP_BITS = 16n;
const IPV6_BITS = 128;
const HTTP_OK = 200;
export const HTTP_FORBIDDEN = 403;
const BIGINT_ZERO = 0n;
const DECIMAL_PART = /^\d{1,3}$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

function parseV4(ip: string): bigint | undefined {
	const parts = ip.split(".");
	if (
		parts.length !== IPV4_PARTS ||
		!parts.every((part) => DECIMAL_PART.test(part))
	)
		return undefined;
	const octets = parts.map(Number);
	return octets.some((octet) => octet > IPV4_MAX_OCTET)
		? undefined
		: octets.reduce(
				(value, octet) => (value << IPV4_OCTET_BITS) | BigInt(octet),
				BIGINT_ZERO
			);
}

/** The groups of an IPv6 address with any `::` expanded to zero groups, or
 *  undefined when the shape cannot be an IPv6 address. */
function expandV6Groups(ip: string): string[] | undefined {
	const halves = ip.split("::");
	if (halves.length > 2) return undefined;
	const head = halves[0] === "" ? [] : halves[0].split(":");
	const tail =
		halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
	const missing = IPV6_GROUPS - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
	const fill = halves.length === 2 ? missing : 0;
	return [...head, ...new Array<string>(fill).fill("0"), ...tail];
}

function parseV6(ip: string): ParsedIp | undefined {
	// An IPv4-mapped address (::ffff:a.b.c.d) is really the IPv4 address.
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
	if (mapped) {
		const v4 = parseV4(mapped[1]);
		return v4 === undefined ? undefined : { v6: false, value: v4 };
	}
	const groups = expandV6Groups(ip);
	if (!groups?.every((group) => HEX_GROUP.test(group))) return undefined;
	const value = groups.reduce(
		(accumulated, group) =>
			(accumulated << IPV6_GROUP_BITS) |
			BigInt(Number.parseInt(group, HEX_RADIX)),
		BIGINT_ZERO
	);
	return { v6: true, value };
}

function parseIp(raw: string): ParsedIp | undefined {
	const ip = raw.trim();
	if (ip.includes(":")) return parseV6(ip);
	const v4 = parseV4(ip);
	return v4 === undefined ? undefined : { v6: false, value: v4 };
}

/** The `/prefix` length of a CIDR entry (the full width when absent), or
 *  undefined when it is malformed or wider than the address. */
function prefixLength(
	prefix: string | undefined,
	width: number
): number | undefined {
	if (prefix === undefined) return width;
	if (!DECIMAL_PART.test(prefix)) return undefined;
	const length = Number(prefix);
	return Number.isInteger(length) && length >= 0 && length <= width
		? length
		: undefined;
}

function isInCidr(address: ParsedIp, cidr: string): boolean {
	const segments = cidr.trim().split("/");
	if (segments.length > 2) return false;
	const [base, prefix] = segments as [string, string | undefined];
	const network = parseIp(base);
	if (network?.v6 !== address.v6) return false;
	const width = address.v6 ? IPV6_BITS : IPV4_BITS;
	const length = prefixLength(prefix, width);
	if (length === undefined) return false;
	const shift = BigInt(width - length);
	return address.value >> shift === network.value >> shift;
}

/**
 * Whether `ip` falls inside any entry of `cidrs` (an address, or an address
 * with a `/prefix`). IPv4 and IPv6 never match each other. Malformed input on
 * either side never matches — the guard fails closed.
 */
export function isIpInCidrs(ip: string, cidrs: string[]): boolean {
	const address = parseIp(ip);
	return (
		address !== undefined && cidrs.some((cidr) => isInCidr(address, cidr))
	);
}

function toB64url(bytes: Uint8Array): string {
	let bin = "";
	for (const byte of bytes) bin += String.fromCharCode(byte);
	return btoa(bin)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/={1,2}$/, "");
}

function fromB64url(encoded: string): Uint8Array<ArrayBuffer> | undefined {
	if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return undefined;
	// A base64 string one char past a 4-char group (length % 4 === 1) is not
	// decodable, and `atob` throws on it. A garbage token must read as
	// "invalid", never escape as an internal error.
	let bin: string;
	try {
		bin = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
	} catch {
		return undefined;
	}
	const out = new Uint8Array(bin.length);
	for (let index = 0; index < bin.length; index++)
		out[index] = bin.charCodeAt(index);
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
	const isValid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret, "verify"),
		sig,
		payload
	);
	if (!isValid) return false;
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
export function isIpCheckEnabled(raw: string | undefined): boolean {
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
}): Promise<
	| { status: typeof HTTP_OK; token: string }
	| { status: typeof HTTP_FORBIDDEN }
> {
	if (!args.secret) return { status: HTTP_FORBIDDEN };
	if (
		args.ipCheck &&
		(args.clientIp === null ||
			!isIpInCidrs(args.clientIp, args.buildingCidrs))
	)
		return { status: HTTP_FORBIDDEN };
	return {
		status: HTTP_OK,
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
	request: Request,
	environment: {
		buildingIp: string | undefined;
		secret: string | undefined;
		siteUrl: string | undefined;
		/** Raw `DOOR_PRESENCE_IP_CHECK`; see {@link isIpCheckEnabled}. */
		ipCheck: string | undefined;
	},
	nowMs: number
): Promise<Response> {
	const result = await presenceResponse({
		clientIp: request.headers.get("cf-connecting-ip"),
		buildingCidrs: parseCidrs(environment.buildingIp),
		secret: environment.secret,
		ipCheck: isIpCheckEnabled(environment.ipCheck),
		nowMs,
	});
	return new Response(
		JSON.stringify(
			result.status === HTTP_OK
				? { token: result.token }
				: { error: "off-site" }
		),
		{
			status: result.status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				"Access-Control-Allow-Origin": environment.siteUrl ?? "",
				Vary: "Origin",
			},
		}
	);
}
