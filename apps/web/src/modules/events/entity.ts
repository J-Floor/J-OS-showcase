import type { Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { prefetchSpec } from "../../shared/data/queryKeeper.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import { lazyPeek } from "../../shared/entity/lazyPeek.tsx";
import { ICONS } from "../../shared/icons.ts";

import { formatEventDate } from "./eventDate.ts";
import { eventAttendeesQuery } from "./queries.ts";
import { visitorUrl } from "./visitorUrl.ts";

/** `useRows` factory for the events descriptor — wraps `listEvents`. Must be
 *  called inside a component (never at module scope). */
function useRows(): Accessor<Doc<"events">[] | undefined> {
	const events = useQuery(api.events.listEvents, {});
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
	detail: (row) => formatEventDate(row.startsAt),
	ability: { action: "view", subject: "Events" },
	peek: lazyPeek(() =>
		import("./EventPeek.tsx").then((module) => module.EventPeek)
	),
	prefetch: (row, canPerform) => {
		if (canPerform("manage", "Events"))
			prefetchSpec(eventAttendeesQuery, row._id);
	},
	qr: (row) => ({
		url: visitorUrl(row._id),
		fileName: `${row.name}-visitor-qr.png`,
	}),
};
