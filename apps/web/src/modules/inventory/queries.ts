import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { QuerySpec } from "../../shared/data/queryKeeper.ts";

/* The inventory sheets' per-row queries, read by the sheet hooks in
   `data/inventoryData.ts` and prefetched by the descriptors in `entity.ts`. */

export const itemsByTypeQuery: QuerySpec<
	typeof api.inventory.listItemsByType,
	Id<"itemTypes">
> = {
	query: api.inventory.listItemsByType,
	args: (typeId) => ({ typeId }),
};

export const itemTypesByCategoryQuery: QuerySpec<
	typeof api.inventory.listItemTypesByCategory,
	Id<"itemCategories">
> = {
	query: api.inventory.listItemTypesByCategory,
	args: (categoryId) => ({ categoryId }),
};
