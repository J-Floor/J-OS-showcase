import { defineFields } from "@j-os/design-system";

import { ICONS } from "../../shared/icons.ts";

/** The time-picker labels, shared by the create form and the sheet. */
export const START_TIME_LABEL = "Start time (Zurich)";
export const END_TIME_LABEL = "End time (Zurich)";

/** The last minute of the day, where an event ends or a TV cutoff lands by default. */
export const END_OF_DAY_TIME = "23:59";

/** An event's fields shown both by its table and its sheet. */
export const eventFields = defineFields({
	name: { label: "Name", icon: ICONS.name },
	startsAt: { label: "Starts", icon: ICONS.start },
	endsAt: { label: "Ends", icon: ICONS.end },
	description: { label: "Description", icon: ICONS.description },
	picture: { label: "Picture", icon: ICONS.placeholder },
	showOnTv: { label: "Show on TV", icon: ICONS.space },
	tvUntil: { label: "Show until", icon: ICONS.date },
});
