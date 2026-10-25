import type { Id } from "../../../../convex/_generated/dataModel";
import type { useLookupItemByAssetTag } from "../data/inventoryData.ts";

import { extractItemLink } from "./extractItemLink.ts";

export type ScanResolution =
	| { kind: "invalid" }
	| { kind: "open"; id: Id<"items">; assetTag: string }
	| { kind: "unknown"; assetTag: string };

/**
 * Parse a scanned QR payload — a deep-link URL or a bare asset tag, both
 * handled by {@link extractItemLink} — and look up whether it belongs to an
 * item.
 */
export async function resolveScannedTag(
	raw: string,
	lookup: ReturnType<typeof useLookupItemByAssetTag>
): Promise<ScanResolution> {
	const link = extractItemLink(raw);
	if (link.kind === "invalid") return { kind: "invalid" };
	const found = await lookup(link.tag);
	return found
		? { kind: "open", id: found._id, assetTag: link.tag }
		: { kind: "unknown", assetTag: link.tag };
}
