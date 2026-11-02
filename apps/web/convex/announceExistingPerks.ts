// One-off: announce the perks that existed before the perk notifications.
//
// `createPerk` sends `perkAdded` for a perk as it is entered, but the perks
// already in the catalog when that went live were never announced. This sends
// one `perkAdded` (push, email and bell) per perk that has not ended, to the
// whole community, with nobody left out.
//
//   bunx convex run announceExistingPerks:run '{"dryRun": true}' --prod
//   bunx convex run announceExistingPerks:run '{"dryRun": false}' --prod
//
// Meant to run once: it keeps no record of what it sent, so a second real run
// announces every perk again.
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { invariant } from "./lib/result.ts";
import { SITE_TIMEZONE, todayIn } from "./lib/time.ts";
import { notify } from "./notify/notify.ts";

/** A catalog this size is not one the board curated by hand. */
const MAX_PERKS = 500;

type Announced = { perkId: Id<"perks">; partner: string; title: string };

/**
 * The perks that have not ended, announced (or, on a dry run, only listed).
 */
export const run = internalMutation({
	args: { dryRun: v.boolean() },
	handler: async (context, { dryRun }): Promise<Announced[]> => {
		const now = Date.now();
		const today = todayIn(SITE_TIMEZONE, now);
		const open = await context.db
			.query("perks")
			.withIndex("by_validUntil", (range) =>
				range.eq("validUntil", undefined)
			)
			.take(MAX_PERKS);
		const dated = await context.db
			.query("perks")
			.withIndex("by_validUntil", (range) =>
				range.gte("validUntil", today)
			)
			.take(MAX_PERKS);
		invariant(
			open.length < MAX_PERKS && dated.length < MAX_PERKS,
			`More than ${MAX_PERKS} perks: raise MAX_PERKS rather than announce half.`
		);
		const active = [...open, ...dated];
		if (!dryRun) {
			for (const perk of active) {
				await notify(context, "perkAdded", {
					perkId: perk._id,
					partner: perk.partner,
					perkTitle: perk.title,
				});
			}
		}
		return active.map((perk) => ({
			perkId: perk._id,
			partner: perk.partner,
			title: perk.title,
		}));
	},
});
