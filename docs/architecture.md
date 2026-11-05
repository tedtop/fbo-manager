# Architecture

FBO Manager is a single Next.js application — there is no separate backend service.
The Next.js app talks directly to a Supabase-hosted Postgres database for data, auth,
realtime, and storage.

```
Browser
  |
  v
Next.js 16 (App Router) ── app/[module]/page.tsx
  |
  v
components/[module]/*.tsx        (forms, boards, cards — UI only)
  |
  v
hooks/use-[entity].ts            (TanStack Query: caching, mutations, invalidation)
  |
  v
services/[domain].service.ts     (business logic that spans repos, e.g. permissions,
  |                                multi-table atomic operations)
  v
repositories/[entity].repo.ts    (pure Supabase queries — .from(table)...)
  |
  v
Supabase (Postgres + Auth + Realtime + Storage)
```

Not every module has a `service` layer — simple single-table CRUD goes straight from
hook to repository. Add a service only when logic spans multiple repositories or
tables, or enforces an access-control rule (see `services/schedule.service.ts` for the
department-scheduling ACL seam).

## Why no backend

The project originally shipped with a Django REST Framework backend. It required
coordinated changes across two codebases for every feature with no technical benefit,
since Supabase already serves the frontend directly via PostgREST, Auth, and Realtime.
The Next.js app no longer talks to it or depends on anything it generates — its
generated OpenAPI TypeScript client has been removed from `frontend/`, and no runtime
path touches Django. The `backend/` directory itself is kept in the repo for
historical reference only; it isn't run, deployed, or maintained. See
`frontend/repositories/*.repo.ts` for the full list of entities and their query
surface.

## Auth

Supabase Auth, wired through `middleware.ts` + `frontend/lib/supabase/{client,server,middleware}.ts`.
No NextAuth, no JWT issued by app code. Session/role checks happen via Supabase's own
session cookies; module-level permissions are modeled in the `profiles`/`roles`/
`user_roles`/`module_permissions` schema (see `frontend/scripts/user-management-schema.sql`)
and read through `hooks/use-permissions.ts`.

## Data access conventions

- Schema changes are plain SQL scripts run against the live Supabase project
  (`frontend/scripts/*.sql`), never a framework migration. `frontend/types/database.ts`
  is a hand-maintained snapshot of the live schema — update it alongside any repository
  change that touches a column, or the local test DB (which mirrors it via
  `frontend/supabase/migrations/`) silently drifts from reality.
- Row-level edit concurrency (presence banner + optimistic compare-and-swap on
  `updated_at`) is documented in `docs/edit-concurrency.md`. As of this writing it's
  only wired up on a couple of modules — check that doc before assuming it's universal.
- Overlay/edit UI conventions (Sheet vs Dialog vs AlertDialog) are documented in
  `docs/ui-conventions.md`.

## Modules

Flight operations, fuel farm (tanks), fuel dispatch (transactions), invoicing/POS,
equipment, training/certifications, truck sheets, parking, department scheduling
(line schedule), and user management. Each has its own directory under
`frontend/components/` and `frontend/repositories/`.

## Flight operations (arrivals/departures board)

- **Time model.** `flight` has `scheduled_arrival_time` / `scheduled_departure_time` (both nullable;
  a CHECK requires at least one), optional `actual_arrival_time` / `actual_departure_time`, and
  `is_quick_turn boolean` (migration `20261103000100_flight_time_model.sql`). A quick turn appears in
  both columns; otherwise a flight with a scheduled arrival shows under Arrivals and one with a
  scheduled departure under Departures, so arrival-only and departure-only (hangar pull) flights show
  in one column. With QT on, the form sets departure = arrival + 1 h.
- **Instants, not naive strings.** All four times are `timestamptz`. The form sends ISO strings with
  the local offset; the UI renders in the browser's zone. Day filters and fetch bounds use the local
  calendar day converted to UTC (`[local 00:00 of start, local 00:00 of the day after end)`), and a
  flight matches a date range when its scheduled arrival OR departure falls inside
  (`board-logic.ts`, `repositories/flights.repo.ts`).
- **Bounded fetch.** The list views load a window of local yesterday to today + 14 days
  (`listFetchWindow`, widened to cover the current week); choosing "All Dates" in the toolbar opts in
  to the unbounded fetch. The calendar view loads exactly the visible Sunday-start week
  (`weekDateParams`), so any week is reachable.
- **Errors.** Create, update, delete and fuel-order handlers in `app/page.tsx` show a destructive toast
  ("Couldn't ...") and rethrow so the form sheet stays open with the user's input; success shows a
  short toast. Edit-concurrency conflicts use the conflict UI in the form, not a toast. Validation is
  inline text, not `alert()`.
- **Soft delete.** Deleting a flight sets `flight.deleted_at` (migration `20261102000000`); queries
  filter `deleted_at IS NULL`. The row stays in the table so an admin can restore it. Delete is
  confirmed through an `AlertDialog` on the card.

## Testing

Two layers, documented in their own READMEs:

- `frontend/tests/` (vitest) — repository-layer integration tests against a real,
  disposable local Supabase/Postgres stack. Proves a query is correct.
- `frontend/cypress/` (Cypress, the only browser-test tool, docs/PLAN.md D14) — drives the real app in a
  real browser through real Supabase Auth login, ending every spec with a direct DB read. Proves a form's
  save button actually persists data, not just that it renders without error. Started with
  `pnpm test:cypress` (own dev server on port 4210); see `frontend/cypress/README.md`.

## Deployment

Railway (see `docs/deployment-railway.md` for the full runbook), building
`frontend/` via Railway's Railpack auto-builder per `frontend/railway.json` —
not a Dockerfile, and not the VPS/Docker plan originally scoped. A production
`frontend/Dockerfile.prod` is kept as a documented alternative for Docker-based
hosting if that's ever needed again. `docker-compose.yaml` remains dev-only
(volume-mounts `frontend/` and runs `pnpm dev`) and is unrelated to either
deploy path. `NEXT_PUBLIC_*` env vars must be available at `next build` time —
Railway's builder exposes configured service variables to the build step
automatically; the Dockerfile alternative requires explicit `ARG` declarations
(see comments in `frontend/Dockerfile.prod`).
