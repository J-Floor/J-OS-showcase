import type { CommandPaletteItem } from "@j-os/design-system";
import { createEffect, createSignal, For, type JSX } from "solid-js";

import { useAbility } from "../../lib/ability.tsx";
import { personEntity } from "../../modules/community/entity.ts";
import { eventsEntity } from "../../modules/events/entity.ts";
import {
	categoryEntity,
	itemEntity,
	itemTypeEntity,
} from "../../modules/inventory/entity.ts";
import { modules } from "../../modules/registry.ts";
import { projectEntity, taskEntity } from "../../modules/tasks/entity.ts";
import type { EntityDescriptor } from "../entity/entityDescriptor.ts";
import { EntitySource, type Emit } from "../entity/EntitySource.tsx";
import { ICONS } from "../icons.ts";

/**
 * Where the palette's results come from.
 *
 * Every source is gated on the same CASL ability the sidebar and the routes
 * use. This is not decoration: search is the one surface that would otherwise
 * hand a guest a list of every member's name, because it reaches past the
 * navigation that normally hides them. A source the current role cannot view is
 * never mounted, so its query is never even subscribed.
 */

/** Pages the current role can actually open. */
export function pageItems(
	navigate: (path: string) => void
): CommandPaletteItem[] {
	const ability = useAbility();
	return modules
		.filter((module) => ability().can("view", module.subject))
		.map((module) => ({
			value: `page:${module.id}`,
			label: module.label,
			group: "Pages",
			icon: module.icon,
			detail: module.path,
			onSelect: () => {
				navigate(module.path);
			},
		}));
}

/** The community console's three tabs, which are destinations in their own
 *  right — "the guests list" is a thing people look for by name. */
export const COMMUNITY_TABS = [
	{
		tab: "applications",
		label: "Applications",
		icon: ICONS.memberApplication,
	},
	{ tab: "members", label: "Members", icon: ICONS.members },
	{ tab: "guests", label: "Guests", icon: ICONS.guestApplication },
] as const;

export const INVENTORY_TABS = [
	{ tab: "items", label: "Items", icon: ICONS.inventory },
	{ tab: "types", label: "Item types", icon: ICONS.itemType },
	{ tab: "categories", label: "Categories", icon: ICONS.category },
] as const;

export function tabItems(
	navigate: (path: string) => void
): CommandPaletteItem[] {
	const ability = useAbility();
	const community = COMMUNITY_TABS.map((entry) => ({
		value: `tab:${entry.tab}`,
		label: entry.label,
		group: "Community",
		icon: entry.icon,
		detail: `/community?tab=${entry.tab}`,
		onSelect: () => {
			navigate(`/community?tab=${entry.tab}`);
		},
	}));
	if (!ability().can("view", "Inventory")) return community;
	return [
		...community,
		...INVENTORY_TABS.map((entry) => ({
			value: `inventory-tab:${entry.tab}`,
			label: entry.label,
			group: "Inventory",
			icon: entry.icon,
			detail: `/inventory?tab=${entry.tab}`,
			onSelect: () => {
				navigate(`/inventory?tab=${entry.tab}`);
			},
		})),
	];
}

/** A descriptor stripped of its specific `Row` type so a heterogeneous set can
 *  live in one array. `EntitySource` only ever calls the functions the
 *  descriptor it was built with supplies, so the erasure is sound. */
type AnyRow = { _id: string };

function erase<Row extends { _id: string }>(
	descriptor: EntityDescriptor<Row>
): EntityDescriptor<AnyRow> {
	return descriptor as unknown as EntityDescriptor<AnyRow>;
}

/**
 * Every entity searchable from the command palette. Order matters here too:
 * it is the tie-break when several rows score the same, and — for a
 * descriptor whose rows resolve before another's — the order groups first
 * appear in on a blank palette.
 *
 * People link to `?person=<id>` and deliberately carry NO tab (see
 * `personEntity`'s docstring: which roster someone belongs to changes, and a
 * guessed `?tab=` would go stale). Tasks/projects are board+core only, which
 * is who `tasks.list`/`projects.list` answer for. Events are searchable for
 * anyone who can view the Events page.
 */
const entityDescriptors: EntityDescriptor<AnyRow>[] = [
	erase(personEntity),
	erase(taskEntity),
	erase(projectEntity),
	erase(eventsEntity),
	erase(itemEntity),
	erase(itemTypeEntity),
	erase(categoryEntity),
];

/**
 * Mounts one gated `EntitySource` per registered descriptor and combines
 * their emitted items into a single flat list handed to `props.onEntities`.
 * Each source is independently ability-gated inside `EntitySource` itself —
 * a role that cannot view an entity never subscribes to its rows — so nothing
 * extra needs gating here.
 *
 * Items are kept in a record keyed by descriptor, seeded with every key up
 * front so the flattened order always matches `entityDescriptors` (an
 * object's already-present keys keep their position on update; only a brand
 * new key would be appended at the end).
 */
export function SearchSources(props: { onEntities: Emit }): JSX.Element {
	const initialItemsByKey = Object.fromEntries(
		entityDescriptors.map((descriptor) => [
			descriptor.key,
			[] as CommandPaletteItem[],
		])
	);
	const [itemsByKey, setItemsByKey] = createSignal(initialItemsByKey);

	createEffect(() => {
		props.onEntities(Object.values(itemsByKey()).flat());
	});

	return (
		<For each={entityDescriptors}>
			{(descriptor) => (
				<EntitySource
					descriptor={descriptor}
					emit={(items) => {
						setItemsByKey((prev) => ({
							...prev,
							[descriptor.key]: items,
						}));
					}}
				/>
			)}
		</For>
	);
}
