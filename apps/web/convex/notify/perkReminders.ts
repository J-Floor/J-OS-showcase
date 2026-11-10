import { internalMutation } from "../_generated/server";
import { DAY_MS } from "../lib/constants.ts";
import {
	isoToUtcMidnight,
	SITE_TIMEZONE,
	todayIn,
	utcMidnightToIso,
} from "../lib/time.ts";

import { notify } from "./notify.ts";

const EXPIRY_NOTICE_DAYS = 7;
/** Perks ending on one day are few; a run past this tells the first ones. */
const MAX_PERKS_PER_DAY = 100;

/** The site date `days` after today's, `YYYY-MM-DD`. */
function siteDateIn(days: number, now: number): string | undefined {
	const today = isoToUtcMidnight(todayIn(SITE_TIMEZONE, now));
	return today === undefined
		? undefined
		: utcMidnightToIso(today + days * DAY_MS);
}

/**
 * The daily perk reminder (`crons.ts`): every perk whose last valid day is
 * {@link EXPIRY_NOTICE_DAYS} site days away is told to the community. A perk
 * matches that date on one day only, so it is told once per daily run, with
 * no stored state: a same-day rerun sends again, and a missed run sends
 * nothing. A perk with no end date never matches.
 */
export const expiringSoon = internalMutation({
	args: {},
	handler: async (context): Promise<void> => {
		const target = siteDateIn(EXPIRY_NOTICE_DAYS, Date.now());
		if (target === undefined) return;
		const perks = await context.db
			.query("perks")
			.withIndex("by_validUntil", (range) =>
				range.eq("validUntil", target)
			)
			.take(MAX_PERKS_PER_DAY);
		for (const perk of perks) {
			await notify(context, "perkExpiringSoon", {
				perkId: perk._id,
				perkTitle: perk.title,
				validUntil: target,
			});
		}
	},
});
