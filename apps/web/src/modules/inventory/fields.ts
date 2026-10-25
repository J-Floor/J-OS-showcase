import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** The free-text description every inventory entity has. */
const description = { label: "Description", icon: ICONS.description };

/** The category an item type, and so each of its items, belongs to. */
const categoryName = { label: "Category", icon: ICONS.category };

/** An item's fields shown both by its table and its sheet. */
export const itemFields = defineFields({
	assetTag: { label: "Asset tag", icon: ICONS.assetTag },
	typeName: { label: "Type", icon: ICONS.itemType },
	categoryName,
	description,
});

/** An item type's fields shown both by its table and its sheet. */
export const itemTypeFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	categoryName,
	description,
});

/** A category's fields shown both by its table and its sheet. */
export const categoryFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	description,
});
