import { Result } from "neverthrow";

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
const parseUrl = Result.fromThrowable(
	(raw: string) => new URL(raw, "https://placeholder.invalid")
);

export function extractItemLink(raw: string): ItemLinkResolution {
	// A relative deep link (no origin) parses fine against a dummy base; an
	// absolute one ignores the base entirely. Either way, pull `item` from the
	// query string when present. A payload that is not URL-parseable at all
	// (e.g. stray characters) is tried as a bare tag.
	const item = parseUrl(raw)
		.map((url) => url.searchParams.get("item"))
		.unwrapOr(null);
	return parseAssetTag(item ?? raw).match(
		(tag): ItemLinkResolution => ({ kind: "tag", tag }),
		(): ItemLinkResolution => ({ kind: "invalid" })
	);
}
