import { err, ok, type Result } from "neverthrow";

import type { InputError } from "./errors/input.ts";

export const MAX_LINKS = 4;
const MAX_URL_LENGTH = 2000;
const MAX_LABEL_LENGTH = 200;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A link an applicant typed, as the board may click it: scheme defaulted to
 * https, parsed, and only http(s) allowed. `null` for anything else —
 * `javascript:`, `data:`, `blob:`, or text `new URL` cannot parse.
 */
export function normalizeHttpUrl(url: string): string | null {
	const trimmed = url.trim();
	if (trimmed === "") return null;
	const withScheme = URL_SCHEME.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	let parsed: URL;
	try {
		parsed = new URL(withScheme);
	} catch {
		return null;
	}
	return parsed.protocol === "http:" || parsed.protocol === "https:"
		? parsed.href
		: null;
}

/**
 * Guard + normalize `venture.links` before they are persisted, on every path
 * that writes them (public sign-up, own-profile edit). Returns the links as
 * they must be stored, or the first violation.
 */
export function parseSafeLinks(
	links: { label: string; url: string }[]
): Result<{ label: string; url: string }[], InputError> {
	if (links.length > MAX_LINKS) return err({ type: "TooManyLinks" });
	const safe: { label: string; url: string }[] = [];
	for (const { label, url } of links) {
		if (url.length > MAX_URL_LENGTH || label.length > MAX_LABEL_LENGTH)
			return err({ type: "LinkTooLong" });
		const normalized = normalizeHttpUrl(url);
		if (normalized === null) return err({ type: "LinkNotHttp" });
		safe.push({ label, url: normalized });
	}
	return ok(safe);
}
