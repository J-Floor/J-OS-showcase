# The lifecycle machine

How a person's state works in J floor, and how to change it without
reintroducing the problem it was built to remove.

Read this before touching anything under `apps/web/convex/lib/lifecycle*.ts`,
`derive.ts`, `lifecycle.ts`, or any code that decides what someone is allowed to
do. The generated state diagram lives in [`lifecycle.md`](./lifecycle.md) and is
produced from the transition table itself — if the two ever disagree, a test
fails.

## Why it exists

Before this, a person's state lived in seven mutable places: an `applications`
row, `people.type`, `kickedOut`, `applicationId`, an access window, a signature
row, and an onboarding record. Nothing owned the answer, so they drifted:

- Imported people read as fully onboarded without ever signing anything,
  because the check keyed off an application they didn't have.
- Promoting a guest to member silently skipped the transition when the state
  didn't match what the code expected, leaving them half-promoted.
- People were accepted and then lost — one confirmed member had no person row
  at all until the migration created one.

That class of bug is not fixable by being careful. It is fixable by having one
writer.

## The shape

Three orthogonal regions. **Only one is stored.**

| Region       | Where it lives        | Values                                                                                                                                              |
| ------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier + stage | stored on `people`    | `prospect`, `guest`, `member`, `core`, `board`, `admin`, `former` × `unverified`, `verified`, `queued`, `denied`, `onboarding`, `active`, `expired` |
| Compliance   | derived, never stored | has this person signed the agreement their _current_ tier requires?                                                                                 |
| Door access  | derived, never stored | should the lock let them in right now?                                                                                                              |

A stored copy of a derived value is how the original mess happened. If you find
yourself adding a `hasSigned` or `canEnter` column, that is the mistake.

## The rules

**One writer.** Every lifecycle write goes through `applyEvent` in
`convex/lifecycle.ts`. Nothing else may patch `tier`, `stage` or `stageSince`.
If a new feature needs to move someone, it dispatches an event; it does not
reach for `ctx.db.patch`.

**Illegal events write nothing.** `reduce` throws before anything is written or
scheduled, so an illegal transition leaves no row change, no audit entry and no
queued email. This holds structurally, not by rollback — which matters in the
nightly sweep, where a rollback would not have saved you.

**Effects are data.** `reduce` is pure: it takes a state, an event and
pre-loaded facts, and returns the next state plus a list of effects. The
mutation executes them. Guards may only read `Facts`; they cannot query.

**The door is a projection.** `access(person, now)` is the single answer to "may
this person enter". The nightly reconciler makes the physical locks match it,
granting as well as revoking. `RECONCILE_DOOR` is the only effect that touches
the door.

**Derived values cannot go stale; stored ones can.** A stored field the machine
writes conditionally — `formerReason` is the example — is only meaningful in the
state that wrote it, and nothing unwrites it: `RE_ADMIT` and `REAPPLY` both leave
`formerReason: "kicked"` sitting on a re-admitted member's doc. Guard such a
field **inside the derivation**, not at each call site. `personStatus()` reads
`formerReason` only when `tier === "former"`, so no screen can forget the guard
and badge a current member as kicked out — which is what happened when the guard
lived in the drawer.

## Changing the machine

**To add an event:** add it to the union in `lib/lifecycleTypes.ts`, to
`ALL_EVENTS`, to the `TABLE` rows it is legal from, and to the Convex validator
in `lifecycle.ts`. Three guards will fail if you miss one — `allEvents()` will
not compile, the totality test will fail, and the move-dialog drift test will
notice the console has no entry for it.

**To add a state:** add it to `ALL_STATES` and give it a `TABLE` entry. Two
tests enforce set equality in both directions, and a third asserts every state
has at least one outgoing edge. **A state nobody can leave is the original bug**,
so that last one is not a formality.

**To add an effect:** add the variant to `Effect`, emit it from a rule, and
handle it in `runEffect`. The reviews check both directions — an effect emitted
but not executed, or executed but never emitted, is a finding.

**To change who may do something:** change the guard or the tier list. Do not
add a second check somewhere else; that is how the two answers start
disagreeing.

## Where things live

| File                            | Responsibility                                                     |
| ------------------------------- | ------------------------------------------------------------------ |
| `convex/lib/lifecycleTypes.ts`  | types only — tiers, stages, events, effects, facts                 |
| `convex/lib/lifecycle.ts`       | `TABLE`, `reduce`, `legalEvents` — pure, no database               |
| `convex/lib/derive.ts`          | compliance, entitlement, door access, `personStatus` — pure        |
| `convex/lib/onboardingSteps.ts` | which steps a tier requires; which are the board's                 |
| `convex/lifecycle.ts`           | `applyEvent`, the effect executor, the scheduled sweep             |
| `convex/doorRevoke.ts`          | the per-person Nuki key revoke (board/admin break-glass keys kept) |
| `convex/door.ts`                | the board's manual override                                        |
| `convex/personEvents.ts`        | the board-gated timeline query                                     |

## Things that will surprise you

**The board's WhatsApp step does not gate activation.** It is tracked, it is
visible in the drawer, and a board member forgetting it cannot hold anyone up.
It lives in `boardSteps`, deliberately separate from the person's own steps.

**Promotion does not touch the door.** A guest becoming a member re-opens the
agreement step and sends the upgrade email, but their access does not blink.
This is the one access-changing edge with no `RECONCILE_DOOR`, and it is
intentional — do not "fix" it.

**A denial is reversible.** `UNDENY` exists precisely so a mis-clicked Deny is
not a six-month dead end for the applicant.

**Expired guests stay in the Guests tab; former members stay in Members.**
Grouping is derived from tier and stage, but a status change never moves
somebody to a different tab. Spatial memory matters more than taxonomy.

**Alumni and kicked-out are different groups.** `former` splits on
`formerReason`: `MARK_LEFT` files someone under Alumni, `KICK_OUT` under Kicked
out. They were briefly one group with a per-row flag marking the difference,
which was wrong — a heading that states something false about a row is not
repaired by a badge further along the same row, because the heading is read
first and believed.

**The table shows exceptions, the drawer shows everything.** `personStatus()`
returns both `flags` and `facts`, and they are not two views of one list. A
`flag` is something the tab, the group header and the other columns do NOT
already say — a missing agreement, a board door override, an outstanding board
to-do — so most rows have none, and an empty Flags cell is the signal that there
is nothing to know. `facts` is the full readout, one labelled line each, and only
the drawer renders it. When you add to the status, decide which of the two it is;
adding it to both is how the table went back to restating its neighbours.

Neither carries any wording. `derive.ts` returns ids and enums; every
user-facing string lives in `src/modules/community/status/copy.ts`, so a copy
change is a frontend change and the machine's rules stay readable without
wading through prose.

**`stageSince` is what makes "stuck" visible.** It is only re-stamped when the
state actually changes, so a board member re-scoring an applicant does not reset
the clock. If you find yourself writing it unconditionally, you have removed the
only signal that someone has been sitting somewhere too long.

## The audit log

Every transition, email, board task, self-serve step and field edit writes a
`personEvents` row. The drawer renders it as a timeline, with field edits
collapsed by default so the shape of someone's history stays legible.

If you add a write that a board member might later ask "who did that, and when"
about, it belongs in the log. `logFieldEdit` handles field-level edits; it
compares scalars, so an array field needs its own comparison or it will record
an edit every time the form is saved.

## The one-off migration

There was a backfill that derived machine state from the legacy model, and a
cleaner that removed the legacy columns afterwards. Both are gone — deleted in
the same change that made `tier`, `stage` and `stageSince` required.

If you ever need something similar: the ordering was **ship the additive code,
run the migration, then flip the reads, then remove the old fields**. Removing
fields before clearing the data makes the Convex push fail, and flipping reads
before the backfill leaves the console empty. That ordering is the whole reason
it shipped in three deploys rather than one.
