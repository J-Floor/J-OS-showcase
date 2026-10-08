import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// The nightly maintenance window targets ~03:00 Zurich. Convex crons are
// UTC-only, so the hours below start at `hourUTC: 1`, which is the winter
// (CET, UTC+1) mapping — 02:00 Zurich — and drifts to 03:00 (CEST, UTC+2) in
// summer; DST shifts it by an hour either way. The jobs are staggered 15 min
// apart (01:15, 01:30, 01:45, then the lifecycle check at 02:00) and carry no
// dependency on each other — see each note. (01:00 UTC was
// the nightly door-key sweep, retired when the app became the way to open the
// doors.)

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

export default crons;
