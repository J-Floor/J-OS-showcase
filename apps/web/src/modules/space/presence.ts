import { PRESENCE_PATH } from "../../../convex/lib/doorPresence.ts";

/**
 * Ask the presence oracle for a short-lived token proving this device is on
 * the J floor network. `null` means the oracle said off-site (403). Anything
 * else unexpected throws. Fetched immediately before each unlock, so a token
 * never has time to expire in between.
 */
export async function fetchPresenceToken(): Promise<string | null> {
	const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
	const res = await fetch(`${base}${PRESENCE_PATH}`, { cache: "no-store" });
	if (res.status === 403) return null;
	if (!res.ok) throw new Error("Couldn't check your network.");
	const body = (await res.json()) as { token: string };
	return body.token;
}
