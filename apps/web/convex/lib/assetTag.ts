import { err, ok, type Result } from "neverthrow";

import type { InputError } from "./errors/input.ts";

/** Asset tags are `A00000`: one Latin letter, then five digits. */
const ASSET_TAG_RE = /^[A-Z]\d{5}$/;

/**
 * Normalize and validate an asset tag. Trims, uppercases the letter, then
 * requires the `A00000` shape; the error message carries that example so the
 * UI can show it as-is.
 */
export function parseAssetTag(raw: string): Result<string, InputError> {
	const tag = raw.trim().toUpperCase(); // eslint-disable-line no-restricted-syntax -- canonical identity key, not UI text
	return ASSET_TAG_RE.test(tag) ? ok(tag) : err({ type: "InvalidAssetTag" });
}
