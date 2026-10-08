<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`bunx convex ai-files install`.

<!-- convex-ai-end -->

# Working in apps/web

Things that are true here and are not obvious from reading the code. Each one
cost real time to discover.

## Verification

**`bun run typecheck` does not typecheck `convex/` the way Convex does.**
`tsconfig.app.json` has no `strict`; `convex/tsconfig.json` sets it, and that is
what `convex deploy` uses. A strict-mode error in `convex/` passes `bun run
typecheck` and fails at deploy. Always run both:

```bash
bun run typecheck
bunx tsc -p convex/tsconfig.json --noEmit
```

`convex/tsconfig.json` excludes `*.test.ts`, so test files are covered by the
first command only.

**`bun run lint` is eslint + stylelint, not prettier.** Run `bun run format` before
pushing, or CI's format job commits on your branch — which carries a skip marker
and suppresses checks on the new head.

**A bad SCSS import specifier is invisible until `bun run build`.** The design
system exports `@j-os/design-system/typography`; `.../styles/typography` does
not resolve. Stylelint passes on the broken one and vitest never compiles CSS,
so only the build catches it. Run `bun run build` when you touch SCSS.

## Tests

- `apps/web` runs vitest under **edge-runtime** app-wide. A Solid component test
  needs `// @vitest-environment happy-dom` as its **first line**; anything importing
  a node builtin needs `// @vitest-environment node`.
- **To run one test file:** `bun run --filter @j-os/web test some.test.ts` from
  the root, or `bun run test some.test.ts` from `apps/web`. Bun drops a leading
  `--`, so `test -- some.test.ts` also runs only that file.
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
- Test files usually pre-exist. **Append; do not overwrite.** Overwriting one has
  destroyed work here before.
- When a fixture breaks because a field became required, fix the fixture. Do not
  weaken what the test asserted to make it pass.

## Lint rules that bite

Everything runs at `--max-warnings 0`.

- **`erasableSyntaxOnly`** — no parameter properties, no `enum`, no `namespace`.
  A class must declare its fields and assign them in the constructor body.
- **`func-style: declaration`** with `allowArrowFunctions: false` — a
  statement-level `const f = () => …` is a failure. Arrow functions as
  object-literal properties are fine.
- **`no-unnecessary-condition`** — fires on a `??` fallback or a guard for a
  field the type says is always present. Making a schema field required will
  surface these across the codebase; that is the point.
- **`import-x/order`** — alphabetised, blank line between groups.

## Convex specifics

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
- The generated `_generated/api.d.ts` is **tracked**. Run `bunx convex codegen`
  after adding or removing a Convex module and commit the result.

## Solid + Ark reactivity traps

Each of these rendered correctly on first paint and then quietly stopped
updating, which is the worst failure mode to debug.

- **`<Show when={x}>{(v) => …}` runs its callback ONCE**, when the condition
  first turns truthy. It does NOT re-run while `x` changes from one truthy
  value to another — the accessor updates, the callback does not. Rendering a
  row inside one froze the table's virtual rows: the server changed, the query
  pushed a new row model, the cells kept their original contents. Use
  `<Show keyed>` (re-renders on identity change) or `<For>`, and memoise the
  source so identity is stable when nothing has changed.
- **A drawer that stores the row object shows a snapshot.** All three community
  tabs did `setSelected(row)`; every edit made from inside the drawer wrote to
  Convex, the roster refetched, and the drawer went on rendering the row as it
  was when opened. Store the id and look it up in the live list each render.
- **Never put a wrapper between an Ark compound parent and its items.** Ark's
  Tooltip has to wrap its trigger, so tooltips on `Segment.Item` insert a
  `<span>` — and zag then measures the sliding indicator at `0×0` and the
  selected option loses its highlight. If a part needs a tooltip, the component
  must forward `asChild` to that part.
- **`ref` callbacks run before attributes are applied.** A ref that reads an
  attribute of its own element (TanStack Virtual reading `data-index`) gets
  `null`. Set what you need inside the ref. And anything the ref writes to a
  reactive store must be deferred (`queueMicrotask`) or it re-enters the render
  that is still running.
- **Passing a signal's value into a render prop's JSX call site remounts the
  child on every change.** A render prop (`asChild={(props) => <Child ... />}`,
  a drawer's `content={(item) => <Panel item={item} />}`) runs inside the
  parent's render, but the JSX it returns is evaluated fresh each time a
  tracked signal it reads changes — Solid has no component identity to diff
  against, so it disposes the previous child and creates a new one. Reading
  `signal()` (the value) at that call site puts the read in that tracked scope;
  passing `signal` (the accessor) instead defers the read into the child's own
  render, so the child mounts once and updates in place. This was the inventory
  drawer-animation bug: the drawer content read the selected item's value
  directly in the render-prop call site, so every field edit remounted the
  drawer and killed its open/close CSS transition mid-flight. Pass accessors
  into render props, not values.

## Design system

- **There are no `--jf-font-size-*` tokens.** Typography goes through the SCSS
  mixins in `styles/typography.scss`. A raw `font-size` is rejected too.
- Verify every `--jf-*` token exists before using it — the real names are often
  not the obvious ones: `--jf-radius-full` (not `-pill`),
  `--jf-border-width-decorative` (not `-thin`), `--jf-opacity-disabled` (not
  `-muted`).
- Every component ships a `.demo.tsx` and a `.test.tsx` and is exported from
  `src/index.ts`. The design system runs jsdom package-wide, so its tests need no
  pragma.
- **Check a token pair actually differs before relying on the contrast.**
  `--jf-surface-bg-overlay` and `--jf-surface-bg-sunken` are both
  `--core-grey-100` in the light theme, so Segment's selected-option highlight
  was invisible there for as long as the component existed — dark mode hid it.
- **jsdom performs no layout**, so anything that measures (a virtualiser, an
  Ark machine) sees zeros and no `ResizeObserver`. Components that window or
  position based on measurement need those stubbed in the test, and should fall
  back to rendering everything when they cannot measure — slow beats blank.

## Reviewing your own work

The recurring failure here is not wrong code — it is **a test that cannot fail**.
Before you call something done, ask of each test: *what would have to break for
this to go red?* If the answer is "nothing", it pins nothing.

Two specific shapes worth checking for:

- **A fixture that proves nothing.** To show a stale field is ignored, the
  fixture must carry the stale value. Without it the test passes for the wrong
  reason.
- **Half a migration.** "The old thing is gone" and "the new thing is
  everywhere" are separate checks. Verify both — a field nothing reads loudly is
  the one whose absence you will not notice.
