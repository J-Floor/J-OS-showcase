import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** An event's fields shown both by its table and its sheet. */
export const eventFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	startsAt: { label: "Starts", icon: ICONS.start },
	endsAt: { label: "Ends", icon: ICONS.end },
});
