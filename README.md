# J-OS

The J-Floor operating system — the community's admin console, member lifecycle,
and door access, built on [SolidJS](https://solidjs.com) +
[Convex](https://convex.dev).

## Where things live

| Path                                               | What                                                           |
| -------------------------------------------------- | -------------------------------------------------------------- |
| [`apps/web`](apps/web)                             | The web app + Convex backend (the whole product today)         |
| [`packages/design-system`](packages/design-system) | `@j-os/design-system` — SolidJS + Ark UI components and tokens |

## Docs you probably want

- **[Running the app + seeding dev data](apps/web/README.md)** — install, sign
  in, seed fake users, impersonate roles.
- **[Operator commands (CLI only)](apps/web/README.md#operator-commands-cli-only)**
  — every admin action with **no button in the app**: the door revoke, data
  migrations/backfills, the Notion import, cron-backed
  maintenance, and deployment inspection. Copy-paste `bunx convex run` snippets, one per command.

## Quick start

```bash
bun install
bun run --filter @j-os/web dev
```

Contributor and agent setup: see `AGENTS.md` (not included in the public
showcase).

See [`apps/web/README.md`](apps/web/README.md) for the rest.

## Runtime

Bun is the package manager and the runtime for all repo tooling: Vite, Vitest,
tsc, ESLint, Stylelint, the Convex CLI and wrangler. Every package with scripts
has a `bunfig.toml` with `[run] bun = true`, so `bun run <script>` runs a tool on
Bun even when its binary asks for `node`. One-off CLIs run with `bunx`; add
`--bun` to force Bun on a machine that also has Node (CI does).

Editor integrations (Vitest extension, ESLint, tsserver) start their own Node
process; that is expected.

Tools that still run on Node, and why: none.

Add a line here for any tool you move back to Node.

## Dev Container

Open the repo in Cursor or VS Code and **Reopen in Container**. That image is
Debian + the Bun version pinned in `package.json`; Convex stays on your **remote** cloud dev deployment (no
local backend).

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
