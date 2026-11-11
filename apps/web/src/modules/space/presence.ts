import { err, ok, type Result, ResultAsync } from "neverthrow";

import {
	HTTP_FORBIDDEN,
	HTTP_SERVICE_UNAVAILABLE,
	PRESENCE_NOT_CONFIGURED,
	PRESENCE_PATH,
} from "../../../convex/lib/doorPresence.ts";
import type { ClientError } from "../../lib/call.ts";

import { NOT_CONFIGURED_CODE, NOT_CONFIGURED_TEXT } from "./doorCopy.ts";

/**
 * Ask the presence oracle for a short-lived token proving this device is on
 * the J floor network. `ok(null)` means the oracle said off-site (403). A 503
 * with the body `{ error: "not-configured" }` means this server has no door
 * control set up: an `Err` with that message. Any other 503, and anything
 * else unexpected, is an `Err` carrying `failureMessage`. Fetched
 * immediately before each unlock, so a token never has time to expire in
 * between.
 */
export async function fetchPresenceToken(
	failureMessage: string
): Promise<Result<string | null, ClientError>> {
	const failure: ClientError = {
		code: "PresenceCheckFailed",
		message: failureMessage,
	};
	const base = import.meta.env.VITE_CONVEX_SITE_URL as string;
	const response = await ResultAsync.fromPromise(
		fetch(`${base}${PRESENCE_PATH}`, { cache: "no-store" }),
		() => failure
	);
	if (response.isErr()) return err(response.error);
	if (response.value.status === HTTP_FORBIDDEN) return ok(null);
	if (response.value.status === HTTP_SERVICE_UNAVAILABLE) {
		const refusal = await ResultAsync.fromPromise(
			response.value.json() as Promise<{ error?: unknown }>,
			() => failure
		);
		if (refusal.isOk() && refusal.value.error === PRESENCE_NOT_CONFIGURED)
			return err({
				code: NOT_CONFIGURED_CODE,
				message: NOT_CONFIGURED_TEXT,
			});
		return err(failure);
	}
	if (!response.value.ok) return err(failure);
	const body = await ResultAsync.fromPromise(
		response.value.json() as Promise<{ token: string }>,
		() => failure
	);
	return body.map((parsed) => parsed.token);
}
