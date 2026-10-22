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

Rules for one part of the app live next to it: `convex/AGENTS.md` for the
backend, `src/AGENTS.md` for the Solid frontend. Design-system rules are in
`packages/design-system/AGENTS.md`.

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

**Only a build compiles SCSS** (stylelint and vitest don't). The Checks
workflow runs the web, landing and playground builds on every PR that affects
them; run
`bun run build` locally to reproduce a failure there.

## Tests

- `apps/web` runs vitest under **edge-runtime** app-wide. A Solid component test
  needs `// @vitest-environment happy-dom` as its **first line**; anything importing
  a node builtin needs `// @vitest-environment node`.
- **To run one test file:** `bun run --filter @j-os/web test some.test.ts` from
  the root, or `bun run test some.test.ts` from `apps/web`. Bun drops a leading
  `--`, so `test -- some.test.ts` also runs only that file.
- Test files usually pre-exist. **Append; do not overwrite.** Overwriting one has
  destroyed work here before.
- When a fixture breaks because a field became required, fix the fixture. Do not
  weaken what the test asserted to make it pass.

## Lint

Everything runs at `--max-warnings 0`; the lint output names the rule. What
the output can't tell you is how to respond:

- Lint exceptions and `max-lines`: see the root `AGENTS.md`.
- **A `jscpd` failure means extract the shared part.** Don't reshuffle lines
  until the detector stops matching.
- **`no-unnecessary-condition` on a `??` or a guard means the type is right
  and the fallback is dead.** Delete it. Making a schema field required
  surfaces these across the codebase; that is the point.
- **Don't disable a rule to get green.** A disable needs a reason after `--`
  that a reviewer would accept, like the `a`/`b` comparator parameters.

## Reviewing your own work

The recurring failure here is not wrong code — it is **a test that cannot fail**.
Before you call something done, ask of each test: _what would have to break for
this to go red?_ If the answer is "nothing", it pins nothing.

Two specific shapes worth checking for:

- **A fixture that proves nothing.** To show a stale field is ignored, the
  fixture must carry the stale value. Without it the test passes for the wrong
  reason.
- **Half a migration.** "The old thing is gone" and "the new thing is
  everywhere" are separate checks. Verify both — a field nothing reads loudly is
  the one whose absence you will not notice.
