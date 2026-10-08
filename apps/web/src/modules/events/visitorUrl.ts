import type { Id } from "../../../convex/_generated/dataModel";

/** The public self-registration URL a visitor QR / copy-link points at. */
export function visitorUrl(eventId: Id<"events">): string {
	return `${window.location.origin}/visitor?event=${eventId}`;
}
