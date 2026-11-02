import { v } from "convex/values";
import { err, ok, type Result } from "neverthrow";

import type { InputError } from "./errors/input.ts";

export const NAME_MAX = 200;
export const EMAIL_MAX = 254;
export const REFERRAL_MAX = 320;
export const VENTURE_NAME_MAX = 300;
export const TEXT_MAX = 5000;
export const PHONE_MAX = 50;
export const SSID_MAX = 64;
export const WIFI_PASSWORD_MAX = 128;

/** A patch ready for `db.patch`: null clears an optional field (undefined
 *  removes it); undefined leaves it untouched. */
export function withNullsCleared(
	patch: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(patch).map(([key, value]) => [key, value ?? undefined])
	);
}

/** An error when a client-supplied string is longer than the field allows. */
export function checkLength(
	value: string | undefined,
	max: number
): Result<void, InputError> {
	return value !== undefined && value.length > max
		? err({ type: "FieldTooLong" })
		: ok();
}

/** An optional text argument a patch can clear: a string sets it, null
 *  clears it, and leaving it out keeps it. */
export const clearableText = v.optional(v.union(v.string(), v.null()));

/** Optional free text: trimmed, capped at `max`, and undefined when blank. */
export function optionalCappedText(
	raw: string | undefined,
	max: number
): Result<string | undefined, InputError> {
	const trimmed = raw?.trim() ?? "";
	return checkLength(trimmed, max).map(() =>
		trimmed === "" ? undefined : trimmed
	);
}
