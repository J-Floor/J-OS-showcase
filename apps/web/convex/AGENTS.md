# Working in apps/web/convex

The Convex backend. Read `_generated/ai/guidelines.md` first (see
`apps/web/AGENTS.md`); these are the rules on top of it.

## Function paths are an API

- **A registered function's path is its address:** the file path plus the
  export name (`api.applications.list`).
  Moving a function to another file or renaming its export changes the
  address. **Never rename or move a registered function as a tidy-up.**
    - A scheduled job stores the address it will call. Rename the target and
      every pending job fails when it comes due. That includes jobs scheduled
      weeks ahead.
    - A client that loaded before the deploy calls the old address until it
      updates. The app's update check recovers, but the user sees one failure
      first.
- A deliberate rename or removal is fine when the change needs it. Say so in
  the PR. If pending jobs target the old address, keep the old export until
  they drain, then delete it.
- This is one reason `unicorn/name-replacements` doesn't check file names.

## Generated code

- `_generated/api.d.ts` is **tracked**, and must list exactly the function
  modules under `convex/` (every file except `schema.ts` and the
  `*.config.ts` files). When you add, remove or rename a module, edit it by hand:
  an `import type` line and an entry in the `fullApi` object, both in sorted
  order. A top-level module is `import type * as people from "../people.js";`
  plus `people: typeof people;`. A nested one is
  `import type * as lib_assetTag from "../lib/assetTag.js";` plus
  `"lib/assetTag": typeof lib_assetTag;`.
- **`bunx convex codegen` is not local.** It uploads the functions to the dev
  deployment in `.env.local`, which every worktree and dev server shares. Run
  it only when you mean to replace what dev is running.

## Transactions and data

- **Never `.collect()` an unbounded table in a mutation.** Transactions have
  read and write limits; crossing them aborts the whole thing, so a job that
  reads everything eventually does nothing at all and the backlog grows. Use
  `.take(N)` and let a cron converge.
- **`.take()` only converges if the work shrinks the table.** Deleting rows does;
  patching them does not — a repeated `.take()` re-reads the same window forever.
  Paginate with a cursor when you are patching.
- **Adding a required field rejects every existing row on deploy.** Loosening is
  always safe; tightening needs the data cleared first. Migration ordering that
  works: ship additive code → run the migration → flip the reads → remove the
  old fields.
- Give a one-off migration a `dryRun` argument that reports what it would
  change. On prod, run it dry, then for real, then dry again to confirm
  nothing is left.

## Scheduled functions in tests

- **`convex-test` never executes scheduled functions.** It records them in the
  `_scheduled_functions` system table at enqueue time:
  `ctx.db.system.query("_scheduled_functions").collect()`. Assert the job's
  **name and args** there. Asserting only that an audit row was written does not
  prove the right function was scheduled — a real bug once survived because
  swapping one email for another passed every test.
- **"At enqueue time" is a convex-test behaviour, NOT production's.** Real Convex
  commits `_scheduled_functions` rows when the transaction commits, so a mutation
  cannot see — or `ctx.scheduler.cancel` — a job it scheduled itself. Any code
  that reads that table to inspect its own scheduling passes every test and does
  nothing in production. A one-off dispatched `VERIFY_EMAIL` and "cancelled" the
  two sends its effects scheduled; nine tests passed, all mutation-checked, and
  prod delivered both emails — to the applicant and to the whole board. If an
  event's effects must not fire, **do not dispatch that event**: pick another
  edge, change the effect, or split the work across mutations. Never build a
  safeguard out of cancelling your own scheduled jobs.
- **Jobs more than ~24.8 days out would fire after 1 ms.** convex-test arms
  each job with a real `setTimeout`, and Node fires any delay past its 32-bit
  limit almost at once, leaking emails into the next test. `test-stubs/setup.ts`
  guards this. Don't remove the guard; `farFutureSchedule.test.ts` pins it.
