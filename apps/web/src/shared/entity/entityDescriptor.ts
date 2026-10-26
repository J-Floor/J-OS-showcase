import type { Accessor } from "solid-js";

import type { Action, AppAbility, Subject } from "../../lib/ability.tsx";
import type { EntityRow, SheetOpenProps } from "../types.ts";

import type { LazyPeek } from "./lazyPeek.tsx";

/** What a row's QR code points at and what its download is called. */
export type EntityQrLink = { url: string; fileName: string };

/** What the peek host hands a kind's peek component: the row the open param
 *  names (undefined while the list loads), and the sheet's open props, to
 *  pass on as they are. */
export type PeekProps<Row extends EntityRow> = SheetOpenProps & {
	row: Row | undefined;
	loading: boolean;
};

export type EntityDescriptor<Row extends EntityRow> = {
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
	qr?: (row: Row) => EntityQrLink;
	/** Warms the sheet's extra queries for one row on hover, focus or palette
	 *  highlight. `canPerform` gates queries the sheet only runs for some viewers. Arg
	 *  objects must equal the sheet's own, or the keeper key differs. */
	prefetch?: (
		row: Row,
		canPerform: (action: Action, subject: Subject) => boolean
	) => void;
	/** The kind's sheet over any page (open param `<key>:<slug>`), a
	 *  `lazyPeek` import so the palette does not load every sheet. */
	peek?: LazyPeek<Row>;
};

/** The slug for a row (`desc.slug?.(row) ?? row._id`). */
export function slugOf<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	return desc.slug?.(row) ?? row._id;
}

/** Relative deep-link path for one slug of this kind (route + query, no
 *  origin). Emits ?tab= only for a static per-descriptor `tab`, never a
 *  per-row value. Use this for in-app navigation (`@solidjs/router`'s
 *  `navigate` rejects scheme-prefixed/absolute targets) — use `entityUrl` for
 *  QR/copy-link. */
export function entityPathOf<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	slug: string
): string {
	const params = new URLSearchParams();

	if (desc.tab !== undefined) {
		params.set(desc.tabParam ?? "tab", desc.tab);
	}
	params.set(desc.param, slug);

	return `${desc.route}?${params.toString()}`;
}

/** Whether this viewer may see this kind. */
export function canView<Row extends EntityRow>(
	ability: AppAbility,
	desc: EntityDescriptor<Row>
): boolean {
	return ability.can(desc.ability.action, desc.ability.subject);
}

/** The descriptor and slug a page link names, or undefined for a link to a
 *  page that holds no single entity. */
export function descriptorForLink(
	url: string,
	descriptors: readonly EntityDescriptor<EntityRow>[]
): { desc: EntityDescriptor<EntityRow>; slug: string } | undefined {
	const parsed = new URL(url, window.location.origin);
	for (const desc of descriptors) {
		const slug = parsed.searchParams.get(desc.param);
		if (parsed.pathname === desc.route && slug) return { desc, slug };
	}
	return undefined;
}

/** Relative deep-link path for one entity row. */
export function entityPath<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	return entityPathOf(desc, slugOf(desc, row));
}

/** Absolute deep-link URL for one entity row. Emits ?tab= only for a static
 *  per-descriptor `tab`, never a per-row value. */
export function entityUrl<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	row: Row
): string {
	return `${window.location.origin}${entityPath(desc, row)}`;
}
