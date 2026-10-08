import type { Accessor } from "solid-js";

import {
	entityUrl,
	type EntityDescriptor,
} from "../../shared/entity/entityDescriptor.ts";
import { ICONS } from "../../shared/icons.ts";

import type { Category, Item, ItemType } from "./data/inventoryData.ts";
import { useCategories, useItems, useItemTypes } from "./data/inventoryData.ts";

/** `useRows` factories — each wraps the module's existing live query. Must be
 *  called inside a component (never at module scope). */
function useItemRows(): Accessor<Item[] | undefined> {
	return useItems().data;
}
function useItemTypeRows(): Accessor<ItemType[] | undefined> {
	return useItemTypes().data;
}
function useCategoryRows(): Accessor<Category[] | undefined> {
	return useCategories().data;
}

/**
 * Item entity descriptor: links use the printed **asset tag**, not `_id` — the
 * tag survives a reseed/re-import while `_id` does not, and it matches what's
 * on the physical label. Only items get a QR (types/categories are palette-
 * searchable but have no per-row affordance).
 */
export const itemEntity: EntityDescriptor<Item> = {
	key: "item",
	route: "/inventory",
	param: "item",
	group: "Inventory",
	icon: ICONS.inventory,
	useRows: useItemRows,
	label: (row) => row.assetTag,
	slug: (row) => row.assetTag,
	detail: (row) => row.typeName,
	ability: { action: "view", subject: "Inventory" },
	tab: "items",
};
// Assigned after the literal so the closure can reference `itemEntity` itself
// without a use-before-define — `entityUrl` needs the full descriptor (route,
// tab, param), not just the row.
itemEntity.qr = (row) => ({
	url: entityUrl(itemEntity, row),
	fileName: `${row.assetTag}-qr.png`,
});

/** Item-type descriptor: `slug` defaults to `_id` (types aren't printed on a
 *  physical label, so there's no stable human-readable alternative). */
export const itemTypeEntity: EntityDescriptor<ItemType> = {
	key: "type",
	route: "/inventory",
	param: "type",
	group: "Inventory",
	icon: ICONS.itemType,
	useRows: useItemTypeRows,
	label: (row) => row.name,
	detail: (row) => row.categoryName,
	ability: { action: "view", subject: "Inventory" },
	tab: "types",
};

/** Category descriptor: `slug` defaults to `_id`, same reasoning as types. */
export const categoryEntity: EntityDescriptor<Category> = {
	key: "category",
	route: "/inventory",
	param: "category",
	group: "Inventory",
	icon: ICONS.category,
	useRows: useCategoryRows,
	label: (row) => row.name,
	ability: { action: "view", subject: "Inventory" },
	tab: "categories",
};
