import { useSearchParams } from "@solidjs/router";
import {
	createComputed,
	createMemo,
	createSignal,
	type Accessor,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import type { EntityDescriptor } from "../../../shared/entity/entityDescriptor.ts";
import { lazyPeek } from "../../../shared/entity/lazyPeek.tsx";
import { PEEK_PARAM, parsePeek } from "../../../shared/entity/peekParam.ts";
import { ICONS } from "../../../shared/icons.ts";

import { perkRequestQuery, prefetchRequestSheet } from "./requestQueries.ts";

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
function useRows(): Accessor<PerkRequestRow[] | undefined> {
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

/** Perk request entity descriptor: the board's, opened as a peek from the
 *  Requests tab, a perk's Requests section and the bell. Its link lands on
 *  the Requests tab, which opens it over the tab. */
export const requestEntity: EntityDescriptor<PerkRequestRow> = {
	key: REQUEST_KEY,
	route: "/perks",
	param: "request",
	tab: "requests",
	group: "Perk requests",
	icon: ICONS.perks,
	useRows,
	label: (row) => row.requesterName,
	keywords: (row) => [row.perkTitle, row.partner],
	detail: (row) => row.perkTitle,
	ability: { action: "manage", subject: "Perks" },
	peek: lazyPeek(() =>
		import("./RequestPeek.tsx").then((module) => module.RequestPeek)
	),
	prefetch: (row) => {
		prefetchRequestSheet(row._id);
	},
};
