import { createMemo, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PerkRow } from "../../../convex/perks.ts";
import { useAbility } from "../../lib/ability.tsx";
import { prefetchSpec } from "../../shared/data/queryKeeper.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { lazyPeek } from "../../shared/entity/lazyPeek.tsx";
import { ICONS } from "../../shared/icons.ts";

import { perkRequestsForPerkQuery } from "./queries.ts";
import { visiblePerks } from "./visiblePerks.ts";

/**
 * `useRows` for the perks descriptor: the perks the viewer's list shows, so
 * the page, the palette and a peek agree. A member's are the ones still
 * running, plus any ended one they have a request open on, so a request in
 * progress never drops out of sight. `undefined` until both lists load: a
 * `?perk=` link to such an ended perk would otherwise read as a dead link
 * and close. A memo, so the rows keep their identity until a query or the
 * viewer's role changes. Called inside a component.
 */
function useRows(): Accessor<PerkRow[] | undefined> {
	const perks = useQuery(api.perks.listPerks, {});
	const mine = useQuery(api.perkRequests.myOpenPerkRequests, {});
	const ability = useAbility();
	const rows = createMemo(() => {
		const loaded = perks.data();
		const open = mine.data();
		return (
			loaded &&
			open &&
			visiblePerks(
				loaded,
				ability().can("manage", "Perks"),
				Date.now(),
				new Set(open.map((request) => request.perkId))
			)
		);
	});
	return rows;
}

/** Warms what a perk's sheet reads for the board alone: its request list.
 *  For a viewer who manages perks: the descriptor checks, and the Requests
 *  tab is the board's. */
export function prefetchPerkSheet(perkId: Id<"perks">): void {
	prefetchSpec(perkRequestsForPerkQuery, perkId);
}

/** Perks entity descriptor: every community tier finds and opens perks;
 *  the board's request list is warmed only for a viewer who manages
 *  perks, the one who sees it. */
export const perksEntity: EntityDescriptor<PerkRow> = {
	key: "perk",
	route: "/perks",
	param: "perk",
	group: "Perks",
	icon: ICONS.perks,
	useRows,
	label: (row) => row.title,
	// A member often looks a perk up by its partner rather than its title.
	keywords: (row) => [row.partner],
	detail: (row) => row.partner,
	ability: { action: "view", subject: "Perks" },
	peek: lazyPeek(() =>
		import("./PerkPeek.tsx").then((module) => module.PerkPeek)
	),
	prefetch: (row, canPerform) => {
		if (canPerform("manage", "Perks")) prefetchPerkSheet(row._id);
	},
};
