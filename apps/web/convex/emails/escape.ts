// apps/web/convex/emails/escape.ts
/**
 * Encode the five HTML-sensitive characters. Safe for both element-text and
 * double-quoted attribute contexts (templates use double-quoted attributes).
 * Ampersand is replaced first so the other entities' `&` isn't re-encoded.
 */
export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
