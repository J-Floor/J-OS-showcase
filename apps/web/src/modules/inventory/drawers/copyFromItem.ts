import type { Item } from "../data/inventoryData.ts";

export function filterItemsByAssetTag(items: Item[], query: string): Item[] {
	const needle = query.trim();
	if (needle === "") return items;
	// eslint-disable-next-line no-restricted-syntax -- case-insensitive search
	const lowered = needle.toLowerCase();
	return items.filter((row) =>
		// eslint-disable-next-line no-restricted-syntax -- case-insensitive search
		row.assetTag.toLowerCase().includes(lowered)
	);
}

export function detailsFromItem(item: Item): {
	typeId: Item["typeId"];
	description: string;
} {
	return {
		typeId: item.typeId,
		description: item.description ?? "",
	};
}
