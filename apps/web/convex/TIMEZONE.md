# Timezone model + migration runbook

## The model (Model B: IXDTF source of truth + cached epoch)

Every zoned instant this app stores is really two fields:

- **`*Local`** (e.g. `startsAtLocal`, `accessUntilLocal`) — an [IXDTF](https://github.com/ietf-wg-sedate/draft-ietf-sedate-datetime-extended)
  string like `2026-09-20T00:01:00+02:00[Europe/Zurich]`: the wall-clock
  someone actually meant, plus the IANA zone that assigns it an offset. This
  is the **source of truth**.
- **The plain epoch** (`startsAt`, `accessUntil`, ...) — a cached UTC
  millisecond number, derived from the `*Local` string by `utcFromLocal`
  (`lib/time.ts`). It exists because every date-index, sort, and comparison
  in the app wants a number; it is a cache, not the truth.

Why cache instead of deriving on read every time: comparisons (`endsAt >=
now`, sort order, index range queries) need a plain number, and re-parsing an
IXDTF string on every read is wasted work for data that essentially never
changes. Why not store only the epoch (the old, pre-#71 model): an epoch
alone cannot tell you what someone meant — "20th at 00:00 UTC" and "20th at
02:00 Zurich" can be the same epoch, and a future IANA tzdata rule change
(a country moving its DST dates) can only be corrected if the wall-clock +
zone is still there to re-derive from. `recomputeZoned` (below) is exactly
that re-derivation.

`SITE_TIMEZONE` (`lib/time.ts`) is `Europe/Zurich` — the one site today.
Multi-site is already representable (the zone lives inside each IXDTF value,
not in a global), just not exercised yet.

**`createEvent`/`updateEvent` reject a non-`SITE_TIMEZONE` embedded zone.** A
caller-supplied `*Local` carries its own IANA zone inside the IXDTF string
(`zonedTimeZoneName`, `lib/time.ts`); if it isn't `Europe/Zurich`, both
mutations throw `` `Event times must be in ${SITE_TIMEZONE}.` `` before
deriving the cached epoch. This closes a real disagreement: without the
guard, a board caller embedding e.g. `[America/Los_Angeles]` would have the
table format the cached epoch in Zurich while the drawer formats the stored
zone verbatim — two different times for the same row.

**The read path does not re-validate a stored zone.** Every writer of
`accessUntilLocal` composes it in `SITE_TIMEZONE` — the guest backfill via
`preserveAsZoned` (see the guest-expiry backfill below) and the lifecycle
`SET_WINDOW` via `zonedLocalFromEpoch` — so a stored guest local is always
`Europe/Zurich` today; this backfill cannot itself introduce a non-Zurich one.
The read side nonetheless never enforces `SITE_TIMEZONE` on an existing
`accessUntilLocal`: it reads the wall-clock + zone as written and re-derives the
epoch, so a value that ever originated elsewhere (some other writer) would be
preserved rather than rejected — unlike `createEvent`/`updateEvent`, which do
reject a non-site zone at write time.

A guest expiry set from a non-Zurich browser during the pre-fix window has a
recognisable fingerprint — 00:00:01 in another zone lands on `HH:00:01` or
`HH:30:01` Zurich — so `previewTimezoneMigration` flags those `preserve` guest
rows `suspicious: true` (`isSuspiciousGuestExpiry`). It is a **human-review
signal, not an auto-fix**: re-meaning a preserved expiry would EXTEND door
access, so the migration never touches it. If the intended end day is known,
re-set it through the guest's access-until picker instead; otherwise the
preserved instant stands.

## Background: why `*Local` was introduced

Pre-#71, `events.startsAt`/`endsAt` were stored as exact UTC-midnight
epochs — a plain date with no real time-of-day intent, silently interpreted
as "midnight UTC", which is wrong for a Zurich site (an event "on the 20th"
should run 00:01–23:59 **Zurich**, not UTC). #71, together with this Model-B
work, fixed it by introducing the `*Local` source of truth described above.
The one-time event backfill that migrated every legacy row ran and verified
on prod on 2026-09-15, and its code has since been retired (this PR) —
events `*Local` is now a required schema field, so no such row can recur.

Guest `accessUntil` has a parallel but different problem: some rows are
genuinely `00:00:01` **Zurich** wall-clock (the UI's `expiryFromIso`
convention, re-meant to mean "through the end of the chosen day"), but others
are arbitrary now-relative instants written by `seed.ts`/`dev.ts` (`now + N *
DAY`) that have nothing to do with day boundaries. Only the first shape gets
re-meaned; the second is preserved exactly. This case is still live — see the
guest-expiry runbook below.

## `migrateEventTimes.ts` — what each export does

| Function | Kind | Purpose |
|---|---|---|
| `previewTimezoneMigration` | `internalQuery` | Read-only. Every **guest** row missing `accessUntilLocal`, with its classification and proposed values. **Read this before writing anything.** |
| `runTimezoneMigration` | `internalMutation`, bounded (`limit`, default 100) | Backfills **guest** `accessUntilLocal` (re-means legacy guest expiries). Rerun until `done: true`. |
| `verifyTimezoneMigration` | `internalQuery` | **Guest** rows still missing `accessUntilLocal`. Expect empty after the backfill. |
| `previewRecompute` | `internalQuery` | Read-only. Rows whose epoch would move under current tzdata. |
| `recomputeEpochs` | `internalMutation`, bounded (`limit`, `cursor`) | Re-derives the cached epoch from the stored `*Local` under current tzdata. Only needed after an IANA/DST rule change. Rerun (passing back `cursor`) until `done: true`. |

**Idempotency is `*Local` absence, never value-shape.** A re-meaned guest
expiry is itself `00:00:01` Zurich — gating a re-run on shape would re-fire on
rows the migration already touched. `isLegacyExpiry` chooses *which*
transform a selected guest row gets; it never decides *whether* the row is
selected. Selection is always "this guest has `accessUntil` but no
`accessUntilLocal`".

## Two-deploy migration sequence (why it's two deploys, not one)

This was done as two deploys. **Deploy 1** shipped `startsAtLocal`/`endsAtLocal`
**optional** (`v.optional(v.string())`) so existing rows kept validating; the
backfill then populated every row; **deploy 2** flipped both fields to
required (`v.string()`). They had to be separate PRs because this repo
squash-merges: making them required in deploy 1 would have rejected every
un-backfilled row on write, so any legacy row a board member touched before the
backfill would fail outright. `accessUntilLocal` (on `people`) stays optional
forever — an open-ended access grant has no `accessUntil` at all, so there is
nothing to require a `*Local` for.

> **Status (2026-09-15): COMPLETE.** Deploy 1, the backfill, and deploy 2 have
> all run on prod. `verifyTimezoneMigration` returned `{ events: [], guests: [] }`
> before events `*Local` was made required. The event-backfill **code** has
> since been retired (this PR) — `previewTimezoneMigration` /
> `runTimezoneMigration` / `verifyTimezoneMigration` now handle **guest**
> expiry only; the runbook below is retained as the guest-only record and
> template for a future re-run. The **recompute** procedure (further down,
> for a future IANA/tzdata rule change) remains live and still covers both
> events and guests.

## GUEST-EXPIRY BACKFILL RUNBOOK (human-run) — completed 2026-09-15

This ran on prod on 2026-09-15 as part of the full events+guests backfill
(see Status above); the steps below are kept as the guest-only record and
template for a future re-run — e.g. if a legacy guest row without
`accessUntilLocal` is ever found again.

1. **Preview (read-only):**
   ```
   bunx convex run --prod migrateEventTimes:previewTimezoneMigration '{}'
   ```
   - Review **every** guest: the re-meaned `accessUntil` and its `deltaMs`
     (should be ≈ +1 day, i.e. `86_400_000`, for a `legacyExpiry` row — more
     or less only across a DST boundary). Confirm the extension is
     acceptable per guest. A `preserve` guest should show `deltaMs: 0`.
   - Review **every** `suspicious: true` guest row by hand (the
     foreign-browser fingerprint described above): it is either a genuine
     edge case worth leaving preserved, or one where the real intended day
     is known and should be re-set through the guest's access-until picker
     — this migration will not touch it automatically.
   - **Anything ambiguous → STOP, do not write, report.**
   - If `guestsTruncated` is `true` in the response, more than 500 guest rows
     need work — the preview only shows the first 500; re-read after each
     `runTimezoneMigration` batch to see the rest.
2. Save the preview output (this is the rollback reference alongside each
   write call's own return value).
3. **Write (bounded — RERUN until `done: true`):**
   ```
   bunx convex run --prod migrateEventTimes:runTimezoneMigration '{}'
   ```
   Save each call's returned `guests` array — each entry carries `from`/`to`,
   which is the rollback map. Repeat until `done: true`. Pass
   `'{"limit": 500}'` to move faster through a large backlog.
   Each re-meaned (`legacyExpiry`) guest with a future new `accessUntil` also
   gets a fresh `windowExpired` job scheduled at that new instant — the old
   job (if any) was scheduled at the pre-migration instant and now just
   no-ops when it fires, so this keeps precise door revocation instead of
   relying on the nightly sweep cron. A `preserve` guest's existing job is
   left untouched.
4. **Verify:**
   ```
   bunx convex run --prod migrateEventTimes:verifyTimezoneMigration '{}'
   ```
   Expect `{ guests: [] }`. Investigate if not — this query uses the same
   absence-gate as the write, so a non-empty result means guest rows still
   need `runTimezoneMigration` (rerun step 3) or something upstream is
   writing an un-zoned guest row again.
5. **Spot-check** a migrated guest's access window in the UI.
6. **Rollback** (if needed): patch each affected guest id back to its saved
   pre-image (`from` in the saved write-call output) — this restores the
   plain epoch; also clear `accessUntilLocal` if you want the row to look
   untouched to a re-run of the preview.

## RECOMPUTE RUNBOOK (only after an IANA/DST-rule change)

Run this only when a tzdata update changes the DST rules for a zone this app
has stored data in (a country moving its DST start/end dates is the usual
trigger) — **not** as part of the regular backfill above, and not routinely.
`recomputeZoned` re-derives both the wall-clock's offset and the cached epoch
from the stored `*Local` string under *current* tzdata, discarding whatever
offset was embedded when the row was written — see the `recomputeZoned`
doc-comment in `lib/time.ts` for the mechanics (it strips the stale offset
before reparsing, because `parseZonedDateTime` throws on an embedded offset
that disagrees with the zone's current rules — exactly the case a rule change
produces).

This covers both **events and guests** — it reads whatever `*Local` value is
stored, regardless of which table it came from.

1. **Preview (read-only):**
   ```
   bunx convex run --prod migrateEventTimes:previewRecompute '{}'
   ```
   Rows whose epoch would move. If both arrays are empty, there is nothing to
   do — **but only if neither `eventsTruncated` nor `guestsTruncated` is
   `true`.** This preview is bounded (first `RECOMPUTE_PREVIEW_LIMIT` rows per
   table); a `true` truncation flag means rows beyond the cap were not
   inspected, so an empty *emitted* set is **not** proof of completeness. At a
   truncation flag, run the recompute regardless — `recomputeEpochs` paginates
   the whole table and no-ops the rows that are already correct.
2. **Recompute (bounded — RERUN, threading the cursor, until `done: true`):**
   ```
   bunx convex run --prod migrateEventTimes:recomputeEpochs '{}'
   ```
   The candidate set here ("has a `*Local`") does **not** shrink as rows are
   fixed — an already-correct row stays a candidate forever, it just becomes
   a no-op patch. So, unlike `runTimezoneMigration`, this call returns a
   `cursor` when it is not done; pass it back on the next call:
   ```
   bunx convex run --prod migrateEventTimes:recomputeEpochs '{"cursor": "<value from the previous result>"}'
   ```
   Omit `cursor` only on the very first call. It scans `events` fully before
   moving to `people`; `done: true` is only ever reported from the `people`
   phase. Each call makes exactly one paginated read, so finishing the
   `events` phase always costs one extra call before `people` starts, even on
   a small table — that call still reports real progress (`changed` reflects
   the events it just fixed), it just isn't the last one. Pass
   `'{"limit": 1000}'` (with no `cursor`, first call) to move through a large
   table in fewer round trips.

   **Reschedules `windowExpired` too.** When a guest's recomputed epoch
   actually moves AND the new instant is still in the future,
   `recomputeGuestEpoch` schedules a fresh `windowExpired` job at that new
   instant — mirroring what the backfill's `runTimezoneMigration` already
   does for a re-meaned `legacyExpiry` guest. Without this, a tzdata shift
   that moves a guest's cached epoch would orphan their existing job
   (scheduled at the old instant); it would fire, find `accessUntil` already
   past it, no-op, and door revocation would silently slip to the nightly
   sweep cron instead of firing at the precise new instant. Events have no
   per-event scheduled expiry, so this applies to guests only.
3. **Verify:**
   ```
   bunx convex run --prod migrateEventTimes:verifyTimezoneMigration '{}'
   ```
   Expect `{ guests: [] }` (proves every guest row still has its
   `accessUntilLocal` — recompute never removes one, but this is the same
   cheap sanity check as after the backfill).
