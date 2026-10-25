import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** The time-picker labels, shared by the create form and the sheet. */
export const START_TIME_LABEL = "Start time (Zurich)";
export const END_TIME_LABEL = "End time (Zurich)";

/** An event's fields shown both by its table and its sheet. */
export const eventFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	startsAt: { label: "Starts", icon: ICONS.start },
	endsAt: { label: "Ends", icon: ICONS.end },
});
