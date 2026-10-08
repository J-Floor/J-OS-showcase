import { useConvexClient, useMutation, useQuery } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { ItemRow, ItemTypeRow } from "../../../../convex/inventory.ts";

export type Category = Doc<"itemCategories">;
export type ItemType = ItemTypeRow;
export type Item = ItemRow;

export function useCategories() {
	return useQuery(
		api.inventory.listCategories,
		{},
		{ keepPreviousData: true }
	);
}

export function useItemTypes() {
	return useQuery(
		api.inventory.listItemTypes,
		{},
		{ keepPreviousData: true }
	);
}

export function useItems() {
	return useQuery(api.inventory.listItems, {}, { keepPreviousData: true });
}

/**
 * The type's items, for the item-type drawer's items accordion. Subscribes
 * only while `typeId()` is defined — pass `undefined` (drawer closed, or a
 * create-mode/unsaved type) and this skips both the initial fetch and the
 * live subscription rather than issuing a query with a throwaway id.
 */
export function useItemsByType(typeId: () => Id<"itemTypes"> | undefined) {
	return useQuery(
		api.inventory.listItemsByType,
		() => ({ typeId: typeId()! }),
		() => ({ enabled: typeId() !== undefined })
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
		api.inventory.listItemTypesByCategory,
		() => ({ categoryId: categoryId()! }),
		() => ({ enabled: categoryId() !== undefined })
	);
}

/** One-shot lookup so a scan can decide exist-vs-create without a subscription. */
export function useLookupItemByAssetTag() {
	const client = useConvexClient();
	return function lookup(assetTag: string) {
		if (!client) return Promise.resolve(null);
		return client.query(api.inventory.getItemByAssetTag, { assetTag });
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
