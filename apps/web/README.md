# @j-os/web

The J-Floor web app and its Convex backend — SolidJS front end, Convex for data,
auth, and scheduled jobs.

## Getting started

This is a Bun workspace (version pinned in the root `package.json`); there is no npm/yarn/pnpm setup here.

```bash
bun install
```

```bash
bun run dev
```

`bun run dev` runs the Vite UI ([http://localhost:5173](http://localhost:5173)) and
`convex dev` together. The first `convex dev` prompts you to log in and pick your
own **cloud** dev deployment (not a local Convex backend).

To run the same stack inside Docker, see [Dev Container](../../README.md#dev-container)
in the repo README (`bunx convex login` on first create, then `bun run dev` from
`apps/web` or `bun run --filter @j-os/web dev` from the root).

## Scripts

| Command             | What                                   |
| ------------------- | -------------------------------------- |
| `bun run dev`       | Vite UI + `convex dev`, together       |
| `bun run build`     | `tsc -b && vite build` → `dist/`       |
| `bun run preview`   | Serve the production build locally     |
| `bun run typecheck` | `tsc -b --noEmit` (see caveat below)   |
| `bun run test`      | Vitest                                 |
| `bun run lint`      | ESLint + Stylelint, `--max-warnings 0` |
| `bun run format`    | Prettier write                         |

> `bun run typecheck` does **not** check `convex/` the way `convex deploy` does —
> run `bunx tsc -p convex/tsconfig.json --noEmit` as well. More gotchas in
> [`AGENTS.md`](AGENTS.md).

## Seeding dev data

Each developer has their own isolated Convex dev deployment (`CONVEX_DEPLOYMENT`
in `.env.local`), separate from production — seeding it never touches prod data.
A fresh dev deployment starts empty, so seed it with fake users:

```bash
bunx convex run seed:run       # reset tables to fixed fake users (board/member/guest/applicant)
bunx convex run seed:clearAll  # wipe people + applications, no reseed
```

`seed:run` is deterministic: re-running always produces the same fixtures, so the
UI renders from a known state. See `convex/seed.ts` for the data.

### Signing in

Sign-in is via magic link, so you must sign in with an email you can actually
receive mail at — the seeded `@jfloor.test` users are fake and cannot sign in.
Access is granted by linking your real email to a profile row. To give yourself
full board access:

```bash
bunx convex run people:addDirect '{"email":"you@example.com","firstName":"Your","lastName":"Name","tier":"board"}'
```

Then request a magic link for that email. Without a linked profile the app shows
"Ask a board member to add you".

### Impersonating roles (dev)

To exercise the app from every angle without juggling accounts, set `DEV_ADMIN_EMAIL` on your dev deployment
(`bunx convex env set DEV_ADMIN_EMAIL you@yourdomain`) and log in once with that
address (in dev the magic link is printed to the Convex logs — run
`bunx convex logs` and open the `[magic-link]` URL). Then flip that one account
into any state from the CLI and refresh the browser — one function per state, no
JSON args:

| Command                                | Resulting state                           |
| -------------------------------------- | ----------------------------------------- |
| `bunx convex run dev:board`            | Board console                             |
| `bunx convex run dev:admin`            | Admin: same rights as board               |
| `bunx convex run dev:staff`            | Staff: door and board contacts only       |
| `bunx convex run dev:member`           | Confirmed member, full access             |
| `bunx convex run dev:guest`            | Confirmed guest                           |
| `bunx convex run dev:memberOnboarding` | Member, approved → onboarding wizard runs |
| `bunx convex run dev:guestOnboarding`  | Guest, approved → onboarding wizard runs  |
| `bunx convex run dev:memberTour`       | Confirmed member, Welcome Tour auto-fires |
| `bunx convex run dev:guestTour`        | Confirmed guest, Welcome Tour auto-fires  |
| `bunx convex run dev:prospect`         | No access                                 |

Each defaults to `DEV_ADMIN_EMAIL`; pass `'{"email":"other@example.com"}'` to
impersonate a different account instead. These live in `convex/dev.ts` and are
dev-only (`internalMutation`s — CLI/dashboard only, never callable from the
client or run in prod).

## Operator commands (CLI only)

These functions have no button in the app — an operator runs them from the
terminal with `bunx convex run`. They are `internal*` functions: reachable from
the CLI and the Convex dashboard, never from the client. Each command below is
its own code block so the copy button grabs exactly one.

- **Target.** Every command runs against **your dev deployment** by default.
  Append `--prod` to run it against **production** (shown below, since that is
  usually where these are needed — drop it to rehearse on dev first).
- **JSON args.** Pass arguments as a single-quoted JSON string. A function
  taking no args needs no JSON.
- **Preview first.** Anything that mutates comes with a read-only `preview`
  (writes nothing) and a `run` that accepts `{"dryRun": true}` (computes, still
  writes nothing). Read the preview before running for real.

### Door access

> **App unlock.** Everyone whose door access is granted (`doorOpensFor`:
> members, core, board/admin, guests inside their window) opens and locks the
> doors from the **Doors** card on the Space page. The app is the only way in:
> personal door keys are retired (see below).
>
> `DOOR_PRESENCE_IP_CHECK` controls the building-IP presence check. It is on
> unless set to exactly `off`; with it off, the presence token no longer proves
> the building network. The presence token, access gate, debounce and Door log
> apply either way.

Nobody is granted a door key any more — the app opens the doors for everyone
whose access is granted. The only door keys left are the break-glass keys of
board/admin people whose door access is granted. Every lifecycle change to a
person's access (their access ending, a board/admin demotion through
`SET_ROLE`) and every board door override schedules `revokeUnlessBreakGlass`: it
does nothing for a board/admin person whose access is granted, and revokes
everyone else's remaining keys on the two J floor locks — so a demoted board
member (now a member, access still granted) loses their key, and so does a
board member the board has shut out. It finds keys only by the person's exact
email or stored provider id, never by name. There is no nightly sweep behind it: if
that run failed (a provider outage), re-run it by hand (needs their `people`
document id):

```bash
bunx convex run doorRevoke:revokeUnlessBreakGlass '{"personId":"<people-id>","trigger":"lifecycle"}' --prod
```

> Lock **health** (is a lock reachable on the provider cloud right now?) is
> `doorHealth:doorHealth`, but it is board-gated and a CLI run carries no
> identity, so it returns `Forbidden`. Read it from the app's **Insights** tab
> instead.

### Data migrations & backfills (one-offs)

Each is a `preview` (read-only) then a `run`. Add `'{"dryRun":true}'` to any
`run` to compute without writing (for `remindUnsigned:run`, without sending).

Upload a board member's handwriting PNG for countersigning (slug from the `signatureSlug` in the `BOARD_SIGNATORIES` env var; the file never enters the repo):

```bash
bunx convex run agreements:setBoardSignature "$(jq -n --arg slug <signatureSlug> --arg d "data:image/png;base64,$(base64 -w0 ~/signatures/<signatureSlug>.png)" '{slug:$slug,dataUrl:$d}')" --prod
```

The JSON travels as one shell argument, and Linux caps a single argument at
about 128 KB. A handwriting PNG is a few KB, far below that; a much larger file
fails with "Argument list too long" before it reaches Convex.

Real `stageSince`, not the cutover moment:

```bash
bunx convex run backfillStageSince:preview --prod
```

```bash
bunx convex run backfillStageSince:run --prod
```

Fix approvals/signatures dated 2025-12-31 (run BEFORE `backfillStageSince`):

```bash
bunx convex run fixImportedDates:preview --prod
```

```bash
bunx convex run fixImportedDates:run --prod
```

Fix the `accessFrom` year 2026→2025 typo (no `dryRun` on these):

```bash
bunx convex run migrations:previewYearFix --prod
```

```bash
bunx convex run migrations:fixImportYear --prod
```

Who would be emailed a signing reminder — **`run` SENDS email**, dry-run first:

```bash
bunx convex run remindUnsigned:preview --prod
```

```bash
bunx convex run remindUnsigned:run --prod
```

Answer an access request (nDSG art. 25): print everything held about one
person as JSON. That covers their person row, the rows they own, signed
agreement PDF links, every address they have used, door-log rows and sign-in
records (session tokens left out). Rows that belong to someone else and only
name them (a guest they host, a task they are on) appear as references
(table, id, field), never as the row, so the JSON can go to them as is. Reply
within 30 days.

```bash
bunx convex run people:exportPerson '{"email":"x@example.org"}' --prod
```

Erase one person by email (a deletion request, or a test or duplicate account).
This deletes:

- their person row and every row they own: signatures and their stored PDFs,
  audit events, door log, attendance, push subscriptions, notifications and
  confirm tokens
- their sign-in user, sessions and accounts, under their current address and
  any earlier one from an email change, unless someone else holds it now

Door-log rows that name someone else are never touched. Rows they only appear on lose their id and are kept. A task keeps its other
assignees, for example. Free-text mentions of their name, such as a board note
on someone else, are not found; search for those by hand. Run the export first
if the person also asked for a copy.

```bash
bunx convex run purge:purgeEmail '{"email":"x@example.org"}' --prod
```

### Cron-backed maintenance (trigger manually)

Each runs nightly (see `convex/crons.ts`); run by hand to force it now.

Expire lapsed guest windows (01:15 UTC):

```bash
bunx convex run lifecycle:sweepExpiredWindows --prod
```

Delete unconfirmed sign-ups older than 7 days (01:30 UTC):

```bash
bunx convex run purge:purgeUnverified --prod
```

### Inspecting the deployment

Tail function logs (dev magic-link URLs print here):

```bash
bunx convex logs
```

Open the data + functions dashboard in the browser:

```bash
bunx convex dashboard
```

Dump a table's rows (swap `people` for any table):

```bash
bunx convex data people
```

List deployment env vars (Nuki token, `NUKI_SMARTLOCK_IDS`, …):

```bash
bunx convex env list
```

Read one env var:

```bash
bunx convex env get NUKI_SMARTLOCK_IDS
```

Regenerate `_generated` after adding/removing a module:

```bash
bunx convex codegen
```

Everything except `dashboard`/`codegen` accepts `--prod` to point at production.

## Deployment

- **Backend (Convex):** `bunx convex deploy` pushes functions + schema to the
  production deployment.
- **Frontend:** `bun run build` emits `dist/`; deploy that as a static site.

Post-deploy admin tasks — migrations, imports, door reconcile — are the
[Operator commands](#operator-commands-cli-only) above.
