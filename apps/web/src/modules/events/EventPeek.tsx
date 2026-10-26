import type { JSX } from "solid-js";

import type { Doc } from "../../../convex/_generated/dataModel";
import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import { EventSheet } from "./EventSheet.tsx";

/** The event sheet over any page. */
export function EventPeek(props: PeekProps<Doc<"events">>): JSX.Element {
	return (
		<EventSheet
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			event={props.row}
			loading={props.loading}
		/>
	);
}
