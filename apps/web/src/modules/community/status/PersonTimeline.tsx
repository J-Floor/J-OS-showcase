import type { JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { HistoryTimeline } from "../../../shared/history/HistoryTimeline.tsx";

export function PersonTimeline(props: { personId: Id<"people"> }): JSX.Element {
	const events = useQuery(
		api.personEvents.listForPerson,
		() => ({ personId: props.personId }),
		{ keepPreviousData: false }
	);
	return <HistoryTimeline entries={events.data()} />;
}
