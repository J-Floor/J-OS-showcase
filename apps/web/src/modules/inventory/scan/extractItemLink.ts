import { parseAssetTag } from "../../../../convex/lib/assetTag.ts";

export type ItemLinkResolution =
	| { kind: "tag"; tag: string }
	| { kind: "invalid" };

/**
 * Resolve a scanned QR payload to an asset tag. Accepts BOTH a full deep-link
 * URL (`.../inventory?tab=items&item=A00001`, absolute or relative) — pulling
 * the `item` search param — and a bare printed tag (`" a00001 "`). Both
 * candidates funnel through `parseAssetTag` for the final shape check, so a
 * URL whose `item` value isn't a real tag (or a URL with no `item` param at
 * all) reports the same `invalid` as junk input.
 *
 * Lives in `scan/`, not `convex/lib/assetTag.ts`: that file backs mutation
 * validators, and a URL must never be accepted there as a storable tag.
 */
export function extractItemLink(raw: string): ItemLinkResolution {
	let candidate = raw;
	try {
		// A relative deep link (no origin) parses fine against a dummy base;
		// an absolute one ignores the base entirely. Either way, pull `item`
		// from the query string when present.
		const url = new URL(raw, "http://placeholder.invalid");
		const item = url.searchParams.get("item");
		if (item !== null) candidate = item;
	} catch {
		// Not URL-parseable at all (e.g. stray characters) — fall through and
		// try the raw payload as a bare tag.
	}
	try {
		return { kind: "tag", tag: parseAssetTag(candidate) };
	} catch {
		return { kind: "invalid" };
	}
}
