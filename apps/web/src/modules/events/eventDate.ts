import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";

// The space is physically in SITE_TIMEZONE, so a travelling admin must see the
// event's Zurich date, not their browser's. Format the stored instant in that
// zone (matches the sheet, which renders the *Local wall-clock in the same zone).
const dateFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeZone: SITE_TIMEZONE,
});

/** An event date as the table and the search palette show it. */
export function formatEventDate(ms: number): string {
	return dateFormat.format(new Date(ms));
}
