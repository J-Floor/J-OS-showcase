import { HEX_RADIX } from "./constants.ts";

function hexOf(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) =>
		byte.toString(HEX_RADIX).padStart(2, "0")
	).join("");
}

/** SHA-256 hex of `text`. Deterministic, so it is safe inside mutations. */
export async function sha256HexOfText(text: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text)
	);
	return hexOf(new Uint8Array(digest));
}

/**
 * `bytes` random bytes as hex. Uses Web Crypto randomness, so it must be
 * called from an ACTION (or test), never a Convex mutation/query: those are
 * deterministic-replayed and forbid real randomness.
 */
export function randomHex(bytes: number): string {
	return hexOf(crypto.getRandomValues(new Uint8Array(bytes)));
}
