import { useSearchParams } from "@solidjs/router";
import {
	createComputed,
	createMemo,
	createSignal,
	type Accessor,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../convex/perkRequests.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { useCan } from "../../lib/ability.tsx";
import { prefetchSpec } from "../../shared/data/queryKeeper.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { lazyPeek } from "../../shared/entity/lazyPeek.tsx";
import { PEEK_PARAM, parsePeek } from "../../shared/entity/peekParam.ts";
import { ICONS } from "../../shared/icons.ts";

import { perkRequestsForPerkQuery } from "./queries.ts";
import {
	perkRequestQuery,
	prefetchRequestSheet,
} from "./requests/requestQueries.ts";
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
function usePerkRows(): Accessor<PerkRow[] | undefined> {
	const perks = useQuery(api.perks.listPerks, {});
	const mine = useQuery(api.perkRequests.myOpenPerkRequests, {});
	const can = useCan();
	const rows = createMemo(() => {
		const loaded = perks.data();
		const open = mine.data();
		return (
			loaded &&
			open &&
			visiblePerks(
				loaded,
				can.I("manage").the("Perks"),
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
	useRows: usePerkRows,
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

const REQUEST_KEY = "request";

/** The args of the request read while it is off: never sent. */
const NO_REQUEST = "" as Id<"perkRequests">;

/**
 * `useRows` for the request descriptor: the one request the peek names,
 * read on its own, never the board's whole list. It keeps the last request
 * asked for once the peek closes or moves to another kind, so the sheet
 * closes with its row instead of an empty one. Empty while no request was
 * asked for (the palette then lists none), `undefined` while it loads, and
 * empty once it is gone or the id is not a request's (the server answers
 * null), which closes the peek as a dead link. Called inside a component.
 */
function useRequestRows(): Accessor<PerkRequestRow[] | undefined> {
	const [params] = useSearchParams();
	const [requestId, setRequestId] = createSignal<Id<"perkRequests">>();
	createComputed(() => {
		const wanted = parsePeek(params[PEEK_PARAM]);
		if (wanted?.kind === REQUEST_KEY)
			setRequestId(wanted.slug as Id<"perkRequests">);
	});
	const request = useQuery(
		perkRequestQuery.query,
		() => perkRequestQuery.args(requestId() ?? NO_REQUEST),
		() => ({
			enabled: requestId() !== undefined,
			// Another request's row while this one loads would read as a
			// dead link and close the peek.
			keepPreviousData: false,
		})
	);
	const rows = createMemo(() => {
		if (requestId() === undefined) return [];
		const row = request.data();
		if (row === undefined) return;
		return row === null ? [] : [row];
	});
	return rows;
}

/** Perk request entity descriptor: the board's. Its link
 *  (`?tab=requests&request=<id>`) opens the Requests tab's own sheet; from
 *  any other page, and from a perk's Requests section, it opens as a peek. */
export const requestEntity: EntityDescriptor<PerkRequestRow> = {
	key: REQUEST_KEY,
	route: "/perks",
	param: "request",
	tab: "requests",
	group: "Perk requests",
	icon: ICONS.perks,
	useRows: useRequestRows,
	label: (row) => row.requesterName,
	keywords: (row) => [row.perkTitle, row.partner],
	detail: (row) => row.perkTitle,
	ability: { action: "manage", subject: "Perks" },
	peek: lazyPeek(() =>
		import("./requests/RequestPeek.tsx").then(
			(module) => module.RequestPeek
		)
	),
	prefetch: (row) => {
		prefetchRequestSheet(row._id);
	},
};
