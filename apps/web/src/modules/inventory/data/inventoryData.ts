import { useConvexClient, useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { ItemRow, ItemTypeRow } from "../../../../convex/inventory.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { itemsByTypeQuery, itemTypesByCategoryQuery } from "../queries.ts";

export type Category = Doc<"itemCategories">;
export type ItemType = ItemTypeRow;
export type Item = ItemRow;

export function useCategories() {
	return useQuery(api.inventory.listCategories, {});
}

export function useItemTypes() {
	return useQuery(api.inventory.listItemTypes, {});
}

export function useItems() {
	return useQuery(api.inventory.listItems, {});
}

/**
 * The type's items, for the item-type drawer's items accordion. Subscribes
 * only while `typeId()` is defined — pass `undefined` (drawer closed, or a
 * create-mode/unsaved type) and this skips both the initial fetch and the
 * live subscription rather than issuing a query with a throwaway id.
 */
export function useItemsByType(typeId: () => Id<"itemTypes"> | undefined) {
	return useQuery(
		itemsByTypeQuery.query,
		() => itemsByTypeQuery.args(typeId()!),
		() => ({
			enabled: typeId() !== undefined,
			keepPreviousData: false,
		})
	);
}

/**
 * The category's item types, for the category drawer's item-types
 * accordion. Same lazy-subscription contract as {@link useItemsByType}.
 */
export function useItemTypesByCategory(
	categoryId: () => Id<"itemCategories"> | undefined
) {
	return useQuery(
		itemTypesByCategoryQuery.query,
		() => itemTypesByCategoryQuery.args(categoryId()!),
		() => ({
			enabled: categoryId() !== undefined,
			keepPreviousData: false,
		})
	);
}

/** One-shot lookup so a scan can decide exist-vs-create without a subscription. */
export function useLookupItemByAssetTag() {
	const client = useConvexClient();
	return function lookup(assetTag: string) {
		return client
			? client.query(api.inventory.getItemByAssetTag, { assetTag })
			: Promise.resolve(null);
	};
}

export function useCategoryActions() {
	const create = useMutation(api.inventory.createCategory);
	const update = useMutation(api.inventory.updateCategory);
	const remove = useMutation(api.inventory.removeCategory);
	return {
		create: (args: Parameters<typeof create.mutate>[0]) =>
			create.mutate(args),
		update: (args: Parameters<typeof update.mutate>[0]) =>
			update.mutate(args),
		remove: (id: Id<"itemCategories">) => remove.mutate({ id }),
	};
}

export function useItemTypeActions() {
	const create = useMutation(api.inventory.createItemType);
	const update = useMutation(api.inventory.updateItemType);
	const remove = useMutation(api.inventory.removeItemType);
	return {
		create: (args: Parameters<typeof create.mutate>[0]) =>
			create.mutate(args),
		update: (args: Parameters<typeof update.mutate>[0]) =>
			update.mutate(args),
		remove: (id: Id<"itemTypes">) => remove.mutate({ id }),
	};
}

export function useItemActions() {
	const create = useMutation(api.inventory.createItem);
	const update = useMutation(api.inventory.updateItem);
	const remove = useMutation(api.inventory.removeItem);
	return {
		create: (args: Parameters<typeof create.mutate>[0]) =>
			create.mutate(args),
		update: (args: Parameters<typeof update.mutate>[0]) =>
			update.mutate(args),
		remove: (id: Id<"items">) => remove.mutate({ id }),
	};
}
