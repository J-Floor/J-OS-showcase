import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// The nightly maintenance window targets ~03:00 Zurich. Convex crons are
// UTC-only, so the hours below start at `hourUTC: 1`, which is the winter
// (CET, UTC+1) mapping — 02:00 Zurich — and drifts to 03:00 (CEST, UTC+2) in
// summer; DST shifts it by an hour either way. The jobs are staggered 15 min
// apart (01:15, 01:30, 01:45, then the lifecycle check at 02:00, the purges
// through 02:45, the view-count purge and salts together at 02:50, the
// snapshot rebuild at 02:55, and the TV event reconcile in its own 03:00
// slot) and carry no dependency on each other; see each note. The hourly
// occupancy job runs at minute 0 too, so it shares that minute with the 02:00
// and 03:00 jobs. (01:00 UTC was the nightly door-key sweep, retired when the
// app became the way to open the doors.)

// Backstop for guest windows that closed while the scheduler was down, or that
// were set before scheduled expiry existed. The per-guest job scheduled at
// `accessUntil` does the normal work; this catches the rest. The app already
// refuses to open the door for a lapsed guest either way: access() reads the
// window live.
crons.daily(
	"expire guest windows missed by the scheduler",
	{ hourUTC: 1, minuteUTC: 15 },
	internal.lifecycle.sweepExpiredWindows,
	{}
);

// Delete sign-ups never confirmed within VERIFY_TTL_MS (7 days). The magic link
// is dead by then, so a returning applicant just submits again. Also sweeps
// expired confirm tokens (applications, visitors, event invites).
crons.daily(
	"purge unverified prospects",
	{ hourUTC: 1, minuteUTC: 30 },
	internal.purge.purgeUnverified,
	{}
);

// Notification history is kept 90 days. Deletes older rows in batches and
// reschedules itself while a batch comes back full.
crons.daily(
	"purge notification history older than 90 days",
	{ hourUTC: 1, minuteUTC: 45 },
	internal.notify.inbox.purgeExpired,
	{}
);

// Access logs are kept 12 months (privacy notice). Two jobs, each deleting in
// batches and rescheduling itself while a batch comes back full.
crons.daily(
	"purge door log older than 12 months",
	{ hourUTC: 2, minuteUTC: 15 },
	internal.accessLogRetention.purgeDoorLog,
	{}
);

crons.daily(
	"purge Wi-Fi open events older than 12 months",
	{ hourUTC: 2, minuteUTC: 30 },
	internal.accessLogRetention.purgeWifiEvents,
	{}
);

// Email quota counters are only read for the current day and month.
crons.daily(
	"purge old email quota counters",
	{ hourUTC: 2, minuteUTC: 45 },
	internal.emailQuota.purgeOld,
	{}
);

// Anonymous view counts (appViews.ts), independent of each other: delete
// past days' hits and salts (who viewed what) and counts past 12 months, make
// the next salts, and rebuild the 7/30/90-day snapshots the Analytics page
// reads.
crons.daily(
	"purge view hits and old view counts",
	{ hourUTC: 2, minuteUTC: 50 },
	internal.appViews.purgeExpired,
	{}
);
crons.daily(
	"prepare view salts",
	{ hourUTC: 2, minuteUTC: 50 },
	internal.appViews.prepareSalts,
	{}
);
crons.daily(
	"rebuild view snapshots",
	{ hourUTC: 2, minuteUTC: 55 },
	internal.appViews.rebuildSnapshots,
	{}
);

// Perks ending in a week, told to the community. Daytime, not the nightly
// window: people read it. 08:00 UTC is 09:00 Zurich in winter and 10:00 in
// summer. The job reads the site date itself, so the hour only picks when
// the message lands.
crons.daily(
	"tell the community about perks ending in a week",
	{ hourUTC: 8, minuteUTC: 0 },
	internal.notify.perkReminders.expiringSoon,
	{}
);

// One email per person a day for the non-urgent notification kinds. After
// the 08:00 perk-expiry job, so its news is in the same digest.
crons.daily(
	"send the daily notification digest",
	{ hourUTC: 8, minuteUTC: 15 },
	internal.notify.digest.send,
	{}
);

// Events leave the TV after their cutoff (the end of a chosen day, or 5 days
// after the event): 03:00 UTC is 04:00 Zurich in winter and 05:00 in summer,
// so a cutoff on one evening leaves before the next morning. Also re-syncs
// every event the TV knows of, which repairs a missed sync. Independent of
// the jobs above.
crons.daily(
	"reconcile event slides on the TV",
	{ hourUTC: 3, minuteUTC: 0 },
	internal.tvEvents.reconcileEventSlides,
	{}
);

// Lock reachability, every 10 minutes: one door-provider list call. The board hears
// only when the set of offline locks changes (opsAlerts dedupes), not every
// tick. No-ops on deployments without a configured door provider.
crons.interval(
	"poll door lock status",
	{ minutes: 10 },
	internal.notify.doorPoll.poll,
	{}
);

// Heal anyone the machine left in onboarding with nothing to do, then tell
// the board about any person whose state disagrees with their data.
crons.daily(
	"check lifecycle invariants",
	{ hourUTC: 2, minuteUTC: 0 },
	internal.invariants.check,
	{}
);

// The occupancy counter, every 5 minutes, when the installed counter can be
// polled. No-ops on deployments without one.
crons.interval(
	"poll occupancy counter",
	{ minutes: 5 },
	internal.occupancy.poll,
	{}
);

// Start each occupancy day from an empty space: counters drift with missed
// events. Hourly on the hour, because 04:00 Zurich is on the hour in UTC in
// both seasons; the runs that are not the day boundary change nothing.
crons.hourly(
	"reset occupancy for the new day",
	{ minuteUTC: 0 },
	internal.occupancy.resetDay,
	{}
);

export default crons;
