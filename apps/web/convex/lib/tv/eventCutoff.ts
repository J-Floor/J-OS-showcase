import type { Doc } from "../../_generated/dataModel";
import { DAY_MS } from "../constants.ts";

/** An event stays on the TV this many days after it ends, unless a cutoff is set. */
export const TV_EVENT_CUTOFF_DAYS = 5;

/** When an event leaves the TV (epoch ms). Derived, so moving the event moves the default. */
export function tvCutoff(
	event: Pick<Doc<"events">, "endsAt" | "tvUntil">
): number {
	return event.tvUntil ?? event.endsAt + TV_EVENT_CUTOFF_DAYS * DAY_MS;
}
