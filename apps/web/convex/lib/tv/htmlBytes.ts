const encoder = new TextEncoder();

/** A slide's HTML size in UTF-8 bytes: what Convex stores and what the caps count. */
export function htmlBytes(text: string): number {
	return encoder.encode(text).length;
}
