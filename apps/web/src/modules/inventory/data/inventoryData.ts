import type { FunctionArgs, FunctionReference } from "convex/server";
import { useConvexClient, useMutation } from "convex-solidjs";

import { api } from "../../../../convex/_generated/api";
import type {
	Doc,
	Id,
	TableNames,
} from "../../../../convex/_generated/dataModel";
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
 * The type's items, for the item-type sheet's items accordion. Subscribes
 * only while `typeId()` is defined — pass `undefined` (sheet closed, or a
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
 * The category's item types, for the category sheet's item-types
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

/** The create, update and remove mutations of one inventory table. */
function useEntityActions<
	Create extends FunctionReference<"mutation">,
	Update extends FunctionReference<"mutation">,
	Remove extends FunctionReference<
		"mutation",
		"public",
		{ id: Id<TableNames> }
	>,
>(references: { create: Create; update: Update; remove: Remove }) {
	const create = useMutation(references.create);
	const update = useMutation(references.update);
	const remove = useMutation(references.remove);
	return {
		create: (args: FunctionArgs<Create>) => create.mutate(args),
		update: (args: FunctionArgs<Update>) => update.mutate(args),
		remove: (id: FunctionArgs<Remove>["id"]) => remove.mutate({ id }),
	};
}

export function useCategoryActions() {
	return useEntityActions({
		create: api.inventory.createCategory,
		update: api.inventory.updateCategory,
		remove: api.inventory.removeCategory,
	});
}

export function useItemTypeActions() {
	return useEntityActions({
		create: api.inventory.createItemType,
		update: api.inventory.updateItemType,
		remove: api.inventory.removeItemType,
	});
}

export function useItemActions() {
	return useEntityActions({
		create: api.inventory.createItem,
		update: api.inventory.updateItem,
		remove: api.inventory.removeItem,
	});
}

/** The fields an item's autosaved edit can change. */
export type ItemPatch = Omit<
	FunctionArgs<typeof api.inventory.updateItem>,
	"id"
>;

/** The fields an item type's autosaved edit can change. */
export type ItemTypePatch = Omit<
	FunctionArgs<typeof api.inventory.updateItemType>,
	"id"
>;

/** The fields a category's autosaved edit can change. */
export type CategoryPatch = Omit<
	FunctionArgs<typeof api.inventory.updateCategory>,
	"id"
>;
