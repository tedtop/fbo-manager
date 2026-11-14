# FBO Manager

Ground operations management for a fixed-base operator (FBO): flight arrivals/departures,
fuel farm monitoring, fuel dispatch, invoicing/POS, equipment, training/certification
compliance, truck sheets, parking, and department scheduling.

## Stack

Next.js 16 (App Router, Turbopack) + React 19 + Supabase (Postgres, Auth, Realtime,
Storage) — the Next.js app talks to Supabase directly, there is no separate backend
service. See `docs/architecture.md` for the full picture.

## Local development

```bash
cd frontend
pnpm install
pnpm supabase:start   # local Supabase stack (requires Docker), first run only
pnpm dev
```

App runs at http://localhost:4000 (port 4000 so it does not clash with the Minuteman project on 3000).

## Shared live database: do not delete these tables

The production Supabase project (`qkuhvlrdidhumyyxokil`, "Minuteman Dashboard") is **shared with a live
application**, and this app's Fuel Farm and Fuel Dispatch screens read the same tables. They hold real
records. Never drop, truncate, rename, reset, re-seed, or "clean up" them, and keep them out of any
`supabase db push`, `db reset`, `db pull`/`db diff` output you apply, and any script that deletes rows.

**Live / real data (hands off):**

| Table | Rows (2026-11-02) | Why it is live |
|---|---|---|
| `tank_level_readings` | 3,030 | Sensor readings, still being written (latest 2026-11-01) |
| `tank_level_min` | 8 | Per-tank minimum levels, updated with the readings |
| `tank_level_readings_backup`, `tank_level_readings_django` | 0 | Companions of the above; leave in place |
| `fuel_dispatch_history` | 2,551 | Dispatch history, written today |
| `fuel_tank` | 7 | Real tank definitions |
| `fuel_density_readings`, `fuel_gravity_readings` | 5, 0 | Real fuel measurements |
| `qt_session`, `adsb_point_cache` | 1, 1 | Written by the other application today |
| `users`, `roles`, `module_permissions` | 16, 4, 28 | Real logins and permissions (last login 2026-05) |
| `users_groups`, `users_user_permissions`, `api_employeeshift` | 0 | Empty Django leftovers; kept for now (the `django_*` / `auth_*` tables were dropped 2026-11-02) |

**This app's own tables** (mostly sample data, safe to change through reviewed migrations): `flight`,
`aircraft`, `parking_location`, `equipment`, `schedule_shift`, `department`, `department_member`,
`training*`, `invoice*`, `truck_sheets`, `truck_meter_readings`, `product`, `profiles`, and the other
tables not listed above. `flight` holds 146 sample flights.

**Unconfirmed, leave alone until the owner says otherwise:** `fueler` (2 rows, "John Doe" and "Fueler Debug", looks like test data, but Fuel Dispatch's assign-fueler dialog reads it and `fueler_assignment` / `fueler_training` reference it) and `terminal_gate` (4 rows, gates A1-B2 at terminal T1, created 2025-10-30 alongside the sample aircraft; nothing in this repo reads it, likely a Django-era leftover).

Also never create, alter, or drop a table named `fuel_tank_readings`; it belongs to another application.

**Rules for schema changes against live:**
- Never run `supabase db push` against the linked project: the local migration history is not recorded
  remotely, so it would replay `test_schema.sql` on live. Apply one reviewed migration at a time, in a
  transaction, with `supabase db query --linked -f <file>`, then
  `supabase migration repair --status applied <version>`.
- Grants in new migrations: grant to `authenticated, service_role` only, never `anon` (B94; the
  copy-pasted `grant all on all sequences in schema public to anon, ...` re-opened the B29 lockdown).
  `frontend/lib/__tests__/migration-grants.test.ts` fails on any `grant ... to anon` in a migration newer
  than `20261109000100`. `node frontend/scripts/check-anon-sequences.mjs` checks the local stack's actual
  privileges. `20261113000400_revoke_anon_regrants.sql` goes to live together with B29's `20261102000400`.
- Back up the affected table first. List the tables a migration touches in its header comment.
- The local test reset (`frontend/tests/support/reset.ts`) refuses non-local URLs; do not weaken that guard.
- This list was inferred from row counts and timestamps. Confirm with the owner before treating a table
  as safe to remove.

## Testing

Two layers, both against a real local Supabase stack — never mocks, never the shared/live project: vitest
(unit and repository tests, no browser) and Cypress (the only browser-test tool, `docs/PLAN.md` D14).

**One-time setup** (needs Docker Desktop running):

```bash
cd frontend
pnpm install
pnpm supabase:start                                 # starts local Postgres/Auth/REST
pnpm exec cypress install                           # only needed for the browser tests, first time
```

**Repository tests** (vitest — proves `repositories/*.repo.ts` queries are correct against
the real schema, fast, no browser):

```bash
pnpm test:repos       # just the repository layer
pnpm test             # everything vitest covers
pnpm test:watch       # watch mode while developing — reruns on save
```

**Type check and lint** (run from `frontend/`):

```bash
pnpm tsc --noEmit     # typecheck, must exit 0
pnpm lint             # Biome lint on the flight-operations files; lint:fix applies safe fixes
```

**Browser tests** (Cypress — drives the real app in a real browser through a real login, ends every
spec with a direct DB read to prove the record actually persisted). Specs live in
`frontend/cypress/e2e/<area>/*.cy.ts`; the Node-side helpers (service-role Supabase tasks, dev-user
seeding, local-stack safety guard) are in `frontend/cypress/tasks/`, and `cy.login()` logs in through the
real login form via `cy.session`. Cypress does not start the app, so the one-command entry starts its own
`next dev` on port 4210 (never 4000) pointed at the local stack, runs Cypress headless with the browser
zone pinned to America/Phoenix, and always stops that server:

```bash
pnpm supabase:start                             # local stack must be up
pnpm exec cypress install                       # first time: downloads the Cypress binary
pnpm test:cypress                               # starts next dev -p 4210, runs headless, stops it
pnpm test:cypress --spec 'cypress/e2e/flight-operations/mobile.cy.ts'   # extra args go to cypress run
```

Override the target with `CYPRESS_BASE_URL` (use your own port when another session is testing). No `.env` file is
needed: the local Supabase URL and the public Supabase CLI demo keys come from `cypress/tasks/env.ts`.
Interactive runner: start `next dev` yourself (set all four `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_*` vars or the
app 500s), then `pnpm cypress:open`. Videos/screenshots are git-ignored. Coverage, how auth works, safety
rules and the known-bug list: `frontend/cypress/README.md`.

**When done:**

```bash
pnpm supabase:stop
```

(Fine to leave the stack running between sessions too — `supabase start` is idempotent.)

**Supabase CLI version:** always use the pinned CLI (`pnpm supabase:start` / `pnpm supabase:reset`, currently 3.0.0, same as
the global Homebrew one). Each CLI version ships its own storage-api image and migrates the `storage` schema to match. If a
stack container was created by a different CLI version, uploads fail with HTTP 500 / Postgres 42P10 (B143). Fix:
`pnpm supabase:stop && pnpm supabase:start`, then `pnpm supabase:reset`.
These same suites (vitest repos, Cypress) run in CI (`.github/workflows/test.yml`, currently manual trigger only), so this is
exactly what a green check on GitHub means. See `frontend/tests/README.md` and
`frontend/cypress/README.md` for how the isolation/safety guards work and current coverage.

## Docs

- [Architecture](docs/architecture.md)
- [UI conventions](docs/ui-conventions.md) (Sheet/Dialog/AlertDialog usage)
- [Edit concurrency](docs/edit-concurrency.md) (row-level optimistic locking + presence)
- Older docs describing the project's original Django-backed design live in
  `docs/archive/` for historical reference — they no longer describe the live system.
- The original Django REST backend was removed from the repo (it stays in git history). See
  [Why no backend](docs/architecture.md#why-no-backend).
