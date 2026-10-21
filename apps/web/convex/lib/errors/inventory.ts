export type InventoryError =
	| { type: "NameRequired" }
	| { type: "CategoryNameTaken" }
	| { type: "ItemTypeNameTaken" }
	| { type: "AssetTagTaken" }
	| { type: "CategoryNotEmpty" }
	| { type: "ItemTypeNotEmpty" };

export const inventoryMessages: Record<InventoryError["type"], string> = {
	NameRequired: "Name is required.",
	CategoryNameTaken: "Another category already uses that name.",
	ItemTypeNameTaken:
		"Another item type in this category already uses that name.",
	AssetTagTaken: "Another item already uses that asset tag.",
	CategoryNotEmpty: "Cannot delete category: item types still use it.",
	ItemTypeNotEmpty: "Cannot delete item type: items still use it.",
};
