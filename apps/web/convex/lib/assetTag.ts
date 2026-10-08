/** Asset tags are `A00000`: one Latin letter, then five digits. */
const ASSET_TAG_RE = /^[A-Z][0-9]{5}$/;

/**
 * Normalize and validate an asset tag. Trims, uppercases the letter, then
 * requires the `A00000` shape. Throws with that example in the message so the
 * UI can show it as-is.
 */
export function parseAssetTag(raw: string): string {
	const tag = raw.trim().toUpperCase(); // eslint-disable-line no-restricted-syntax -- canonical identity key, not UI text
	if (!ASSET_TAG_RE.test(tag)) {
		throw new Error(
			"Asset tag must be one uppercase letter followed by five digits (e.g. A00000)."
		);
	}
	return tag;
}
