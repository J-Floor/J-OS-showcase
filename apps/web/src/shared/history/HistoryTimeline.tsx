import { EmptyState, Query, Timeline } from "@j-os/design-system";
import type { JSX } from "solid-js";

import type { HistoryEntry } from "../../../convex/history/types.ts";

import { toTimelineEntry } from "./historyEntry.ts";

/** A history as a timeline: the skeleton while `entries` loads
 *  (`undefined`), "No history yet" when there is none. */
export function HistoryTimeline(props: {
	entries: readonly HistoryEntry[] | undefined;
}): JSX.Element {
	return (
		<Query.Root data={props.entries}>
			<Query.Content of={props.entries}>
				{(rows) => (
					<Timeline
						entries={rows().map((row) => toTimelineEntry(row))}
					>
						<Timeline.Empty>
							<EmptyState title="No history yet" />
						</Timeline.Empty>
					</Timeline>
				)}
			</Query.Content>
		</Query.Root>
	);
}
