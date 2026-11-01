import { isoToUtcMidnight } from "../../../convex/lib/time.ts";

/** What a perk without an end date shows where its date would be. */
const NO_END_DATE = "No end date";

// `validUntil` is a calendar day, not an instant. Formatting that day's UTC
// midnight in UTC shows the stored day itself, whatever the browser's zone.
const dayFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeZone: "UTC",
});

/** A perk's end date as its table, sheet and peek show it. */
export function formatValidUntil(validUntil: string | undefined): string {
	return validUntil === undefined
		? NO_END_DATE
		: dayFormat.format(isoToUtcMidnight(validUntil));
}
