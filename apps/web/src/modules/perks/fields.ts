import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** A perk's fields, shared by its table, its sheet and its create form. */
export const perkFields = defineFields({
	partner: { label: "Partner", icon: ICONS.partner },
	title: { label: "Perk", icon: ICONS.name },
	category: { label: "Category", icon: ICONS.category },
	validUntil: { label: "Valid until", icon: ICONS.end },
	link: { label: "Link", icon: ICONS.link },
	contact: { label: "Contact", icon: ICONS.person },
	terms: { label: "Terms", icon: ICONS.description },
});
