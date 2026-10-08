import type { Accessor } from "solid-js";

import type { Action, Subject } from "../../lib/ability.tsx";

export type EntityDescriptor<Row extends { _id: string }> = {
	key: string; // "event" | "person" | "task" | "item" | ...
	route: string; // "/events"
	param: string; // URL search param, e.g. "event"
	group: string; // palette group label
	icon: string;
	/** Live rows — a hook factory, CALLED inside a component (never at module
	 *  scope). Wraps useQuery/useMembers/etc. */
	useRows: () => Accessor<Row[] | undefined>;
	label: (row: Row) => string;
	/** The stable id used in the URL. Default `row._id`. Items override to
	 *  `row.assetTag` because item `_id` changes on reseed/re-import while the
	 *  printed asset tag does not. `selected()` matches on this. */
	slug?: (row: Row) => string;
	keywords?: (row: Row) => string[];
	detail?: (row: Row) => string | undefined;
	searchOnly?: boolean; // default true
	ability: { action: Action; subject: Subject };
	/** Tabbed pages with a FIXED tab per entity type (inventory: item→"items").
	 *  A static string, NOT a per-row function: a per-row tab would bake a
	 *  guessable-stale tab into shared links (see community note in Task 8). */
	tab?: string;
	tabParam?: string; // defaults to "tab" when `tab` is set
	/** Entities with a shareable QR (items, events). */
	qr?: (row: Row) => { url: string; fileName: string };
};

/** The slug for a row (`desc.slug?.(row) ?? row._id`). */
export function slugOf<Row extends { _id: string }>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	return desc.slug?.(row) ?? row._id;
}

/** Relative deep-link path for one entity row (route + query, no origin).
 *  Emits ?tab= only for a static per-descriptor `tab`, never a per-row value.
 *  Use this for in-app navigation (`@solidjs/router`'s `navigate` rejects
 *  scheme-prefixed/absolute targets) — use `entityUrl` for QR/copy-link. */
export function entityPath<Row extends { _id: string }>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	const params = new URLSearchParams();

	if (desc.tab !== undefined) {
		params.set(desc.tabParam ?? "tab", desc.tab);
	}
	params.set(desc.param, slugOf(desc, row));

	return `${desc.route}?${params.toString()}`;
}

/** Absolute deep-link URL for one entity row. Emits ?tab= only for a static
 *  per-descriptor `tab`, never a per-row value. */
export function entityUrl<Row extends { _id: string }>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	return `${window.location.origin}${entityPath(desc, row)}`;
}
