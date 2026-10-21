// The counter webhook, minus Convex: who may post (a shared secret) and what
// the adapter made of the body. `http.ts` supplies the request and applies
// the updates. Web Crypto only, which every Convex runtime provides.
import { occupancyErrorDetail } from "../errors/occupancy.ts";

import type { OccupancyProvider } from "./provider.ts";
import type { OccupancyUpdate } from "./update.ts";

export const OCCUPANCY_WEBHOOK_PATH = "/occupancy/webhook";

const BEARER = "Bearer ";

export const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

async function digest(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
	);
}

/** Whether `given` is the configured secret. Compares fixed-length digests
 *  byte by byte without stopping early. An unset secret matches nothing. */
export async function secretMatches(
	given: string | null,
	expected: string | undefined
): Promise<boolean> {
	if (!expected || given === null) return false;
	const [left, right] = await Promise.all([digest(given), digest(expected)]);
	let difference = 0;
	for (const [index, byte] of left.entries())
		difference |= byte ^ (right[index] ?? 0);
	return difference === 0;
}

type WebhookOutcome =
	| { status: typeof HTTP_OK; updates: OccupancyUpdate[] }
	| {
			status:
				| typeof HTTP_BAD_REQUEST
				| typeof HTTP_UNAUTHORIZED
				| typeof HTTP_NOT_FOUND;
	  };

export async function readWebhook(
	request: Request,
	options: { provider: OccupancyProvider | null; secret: string | undefined }
): Promise<WebhookOutcome> {
	const { provider, secret } = options;
	if (!provider?.parseWebhook) return { status: HTTP_NOT_FOUND };
	const header = request.headers.get("authorization");
	const given = header?.startsWith(BEARER)
		? header.slice(BEARER.length)
		: null;
	if (!(await secretMatches(given, secret)))
		return { status: HTTP_UNAUTHORIZED };
	const parsed = provider.parseWebhook(await request.text(), request.headers);
	if (parsed.isErr()) {
		// eslint-disable-next-line no-console -- the operator reads a rejected delivery in the Convex logs
		console.warn(
			`[occupancy-webhook] ${occupancyErrorDetail(parsed.error)}`
		);
		return { status: HTTP_BAD_REQUEST };
	}
	return { status: HTTP_OK, updates: parsed.value };
}
