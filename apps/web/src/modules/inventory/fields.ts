import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** The free-text description every inventory entity has. */
const description = { label: "Description", icon: ICONS.description };

/** An item's fields shown both by its table and its sheet. */
export const itemFields = defineFields({
	assetTag: { label: "Asset tag", icon: ICONS.assetTag },
	typeName: { label: "Type", icon: ICONS.itemType },
	description,
});

/** An item type's fields shown both by its table and its sheet. */
export const itemTypeFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	categoryName: { label: "Category", icon: ICONS.category },
	description,
});

/** A category's fields shown both by its table and its sheet. */
export const categoryFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	description,
});
