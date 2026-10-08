import { useQuery } from "convex-solidjs";
import type { Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { ICONS } from "../../shared/icons.ts";

import { visitorUrl } from "./visitorUrl.ts";

// Fixed to the site zone, not the browser's — a travelling admin must see the
// same date here as in the table/drawer (both Zurich), not their host TZ.
const dateFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeZone: SITE_TIMEZONE,
});

/** `useRows` factory for the events descriptor — wraps `listEvents`. Must be
 *  called inside a component (never at module scope). */
function useRows(): Accessor<Doc<"events">[] | undefined> {
	const events = useQuery(
		api.events.listEvents,
		{},
		{ keepPreviousData: true }
	);
	return events.data;
}

/** Events entity descriptor: member-visible list, board/admin visitor QR
 *  (gated by callers with `manage`/`Events`). */
export const eventsEntity: EntityDescriptor<Doc<"events">> = {
	key: "event",
	route: "/events",
	param: "event",
	group: "Events",
	icon: ICONS.events,
	useRows,
	label: (row) => row.name,
	detail: (row) => dateFormat.format(new Date(row.startsAt)),
	ability: { action: "view", subject: "Events" },
	qr: (row) => ({
		url: visitorUrl(row._id),
		fileName: `${row.name}-visitor-qr.png`,
	}),
};
