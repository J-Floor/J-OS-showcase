const MAX_LINKS = 4;
const MAX_URL_LENGTH = 2000;
const MAX_LABEL_LENGTH = 200;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A link an applicant typed, as the board may click it: scheme defaulted to
 * https, parsed, and only http(s) allowed. `null` for anything else —
 * `javascript:`, `data:`, `blob:`, or text `new URL` cannot parse.
 */
export function normalizeHttpUrl(url: string): string | null {
	const trimmed = url.trim();
	if (trimmed === "") return null;
	const withScheme = HAS_SCHEME.test(trimmed)
		? trimmed
		: `https://${trimmed}`;
	let parsed: URL;
	try {
		parsed = new URL(withScheme);
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
		return null;
	return parsed.href;
}

/**
 * Guard + normalize `venture.links` before they are persisted, on every path
 * that writes them (public sign-up, own-profile edit). Returns the links as
 * they must be stored; throws on any violation.
 */
export function assertSafeLinks(
	links: { label: string; url: string }[]
): { label: string; url: string }[] {
	if (links.length > MAX_LINKS)
		throw new Error(`Too many links (max ${String(MAX_LINKS)}).`);
	return links.map(({ label, url }) => {
		if (url.length > MAX_URL_LENGTH || label.length > MAX_LABEL_LENGTH)
			throw new Error("Link is too long.");
		const normalized = normalizeHttpUrl(url);
		if (normalized === null)
			throw new Error("Links must use http or https.");
		return { label, url: normalized };
	});
}
