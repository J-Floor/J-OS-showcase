import {
	HTTP_FORBIDDEN,
	PRESENCE_PATH,
} from "../../../convex/lib/doorPresence.ts";

/**
 * Ask the presence oracle for a short-lived token proving this device is on
 * the J floor network. `null` means the oracle said off-site (403). Anything
 * else unexpected throws. Fetched immediately before each unlock, so a token
 * never has time to expire in between.
 */
export async function fetchPresenceToken(): Promise<string | null> {
	const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
	const response = await fetch(`${base}${PRESENCE_PATH}`, {
		cache: "no-store",
	});
	if (response.status === HTTP_FORBIDDEN) return null;
	if (!response.ok) throw new Error("Couldn't check your network.");
	const body = (await response.json()) as { token: string };
	return body.token;
}
