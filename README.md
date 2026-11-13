# J-OS

The J-Floor operating system — the community's admin console, member lifecycle,
and door access, built on [SolidJS](https://solidjs.com) +
[Convex](https://convex.dev).

## Where things live

| Path                                                       | What                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [`apps/web`](apps/web)                                     | The web app + Convex backend (the product)                        |
| [`apps/landing-page`](apps/landing-page)                   | The public landing site, deployed to Cloudflare Pages             |
| [`packages/design-system`](packages/design-system)         | `@j-os/design-system` — SolidJS + Ark UI components and tokens    |
| [`packages/config-eslint`](packages/config-eslint)         | Shared ESLint config                                              |
| [`packages/config-stylelint`](packages/config-stylelint)   | Shared Stylelint config                                           |
| [`packages/config-typescript`](packages/config-typescript) | Shared `tsconfig` bases                                           |
| [`packages/config-vite`](packages/config-vite)             | Shared Vite config                                                |
| [`scripts`](scripts)                                       | Repo tooling: quality gates, the public-mirror leak gate, staging |
| [`docs`](docs)                                             | Member lifecycle and design-system notes                          |

## Quick start

```bash
bun install
bun run --filter @j-os/web dev
```

[`apps/web/README.md`](apps/web/README.md) covers the rest: signing in, seeding
fake users, impersonating roles, and the
[operator commands](apps/web/README.md#operator-commands-cli-only) that have no
button in the app (door revoke, migrations and backfills, the Notion import,
cron maintenance, deployment inspection).

## Harness

Most code here is written by AI agents. The repo is set up so that an agent
cannot skip the process, and so that the checks catch what a reviewer would.

**Process.** Every change goes through the
[superpowers-custom](https://github.com/stanlrt/cc-superpowers-parallelised)
plugin, a fork of [obra/superpowers](https://github.com/obra/superpowers): a
spec, then a plan, then subagents that implement disjoint tasks in parallel.
Subagents never commit. The controller reviews each task against a tree
snapshot, commits it, and runs a whole-branch correctness review plus a
separate refactor review before the PR opens. A hook blocks edits, commits
and pushes until the plugin is installed and an entry skill has run, and CI
fails a PR that adds no dated spec or plan.

**Formatting.** [oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats
every package and sorts `package.json` keys. CI runs it and commits the fix.

**Lint.** ESLint and Stylelint run with `--max-warnings 0`.

- ESLint: `sonarjs`, `unicorn`, `solid`, `import-x`, `unused-imports`, and
  `eslint-comments` (every disable needs a reason). `boundaries` enforces the
  module layering in `apps/web`.
- Custom rules in [`apps/web/eslint`](apps/web/eslint): an unhandled
  `neverthrow` `Result` is an error, and an unbounded `.collect()` inside a
  Convex mutation is an error.
- Stylelint: SCSS standard config plus defensive-CSS, logical-properties,
  strict-value (colors, spacing, type and shadows must use tokens), and
  high-performance-animation plugins.

**Types and tests.** `tsc` (TypeScript 7) type-checks every package, and
Vitest runs sharded in CI, with `convex-test` for backend functions.

**Code health.** [fallow](https://github.com/fallow-rs/fallow) fails CI on
dead code and duplication. A weekly sweep adds structural duplication
(dryer), CRAP risk scores from coverage (crapper), and a Stryker mutation
report. `bun run quality` runs the same checks locally, without the mutation
report.

**Security.** CI runs a dependency audit and gitleaks. `bun run leaks` runs
the public-mirror leak gate, and the push hook runs it before every
`git push`.

## Runtime

Bun is the package manager and the runtime for all repo tooling: Vite, Vitest,
tsc, ESLint, Stylelint, oxfmt, the Convex CLI and wrangler. Every package with
scripts has a `bunfig.toml` with `[run] bun = true`, so `bun run <script>` runs
a tool on Bun even when its binary asks for `node`. One-off CLIs run with
`bunx`; add `--bun` to force Bun on a machine that also has Node (CI does).
No repo tool runs on Node.

Editor integrations (Vitest extension, ESLint, tsserver) start their own Node
process; that is expected.

## Dev Container

Open the repo in Cursor or VS Code and **Reopen in Container**. The image is
Debian + the Bun version pinned in `package.json`. Convex stays on your
**remote** cloud dev deployment (no local backend).

After the container is created:

```bash
bunx convex login
bun run --filter @j-os/web dev
```

Open the login URL on the host if the container cannot launch a browser. Then
follow seeding, `SITE_URL`, and magic links in
[`apps/web/README.md`](apps/web/README.md).

## Credits

Designed and built by [Stanislas Laurent](https://stanlrt.tech) ([@stanlrt](https://github.com/stanlrt)) for J floor.

## License

All rights reserved; no licence is granted. The public `J-Floor/J-OS-showcase`
repository is a read-only mirror of this one, without the design docs.
