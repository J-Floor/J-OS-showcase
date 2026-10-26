import type { CommandPaletteItem } from "@j-os/design-system";
import { createEffect, createSignal, For, type JSX } from "solid-js";

import { useAbility } from "../../lib/ability.tsx";
import { ROSTER_TABS } from "../../modules/community/communityTabs.ts";
import { communityModule } from "../../modules/community/index.ts";
import { inventoryModule } from "../../modules/inventory/index.ts";
import { INVENTORY_TABS } from "../../modules/inventory/inventoryTabs.ts";
import { prefetchModule } from "../../modules/prefetchModule.ts";
import { modules } from "../../modules/registry.ts";
import { entityDescriptors } from "../entity/entityDescriptors.ts";
import { EntitySource, type Emit } from "../entity/EntitySource.tsx";

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
			onHighlight: () => {
				prefetchModule(module);
			},
		}));
}

/** The community rosters and the inventory tabs, as palette destinations. */
export function tabItems(
	navigate: (path: string) => void
): CommandPaletteItem[] {
	const ability = useAbility();
	const community = ROSTER_TABS.map((entry) => ({
		value: `tab:${entry.tab}`,
		label: entry.label,
		group: "Community",
		icon: entry.icon,
		detail: `/community?tab=${entry.tab}`,
		onSelect: () => {
			navigate(`/community?tab=${entry.tab}`);
		},
		onHighlight: () => {
			prefetchModule(communityModule);
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
			onHighlight: () => {
				prefetchModule(inventoryModule);
			},
		})),
	];
}

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
