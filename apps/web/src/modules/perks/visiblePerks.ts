import { isPerkExpired } from "../../../convex/lib/perks.ts";
import type { PerkRow } from "../../../convex/perks.ts";

/**
 * The perks a viewer's table lists. The board keeps every perk in view,
 * expired ones too, to renew or remove them. Everyone else sees the perks
 * they can still request, plus any expired perk in `openPerkIds` (the perks
 * they have an open request on), so a request in progress never drops out
 * of sight.
 */
export function visiblePerks(
	rows: PerkRow[],
	canManage: boolean,
	now: number,
	openPerkIds: ReadonlySet<string>
): PerkRow[] {
	return rows.filter(
		(row) =>
			canManage ||
			openPerkIds.has(row._id) ||
			!isPerkExpired(row.validUntil, now)
	);
}
