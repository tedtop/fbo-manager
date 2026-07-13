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
  `modified_at`) is documented in `docs/edit-concurrency.md`. As of this writing it's
  only wired up on a couple of modules — check that doc before assuming it's universal.
- Overlay/edit UI conventions (Sheet vs Dialog vs AlertDialog) are documented in
  `docs/ui-conventions.md`.

## Modules

Flight operations, fuel farm (tanks), fuel dispatch (transactions), invoicing/POS,
equipment, training/certifications, truck sheets, parking, department scheduling
(line schedule), and user management. Each has its own directory under
`frontend/components/` and `frontend/repositories/`.

## Testing

Two non-overlapping layers, both documented in their own READMEs:

- `frontend/tests/` (vitest) — repository-layer integration tests against a real,
  disposable local Supabase/Postgres stack. Proves a query is correct.
- `frontend/e2e/` (Playwright) — drives the real app in a real browser through real
  Supabase Auth login, ending every spec with a direct DB read. Proves a form's save
  button actually persists data, not just that it renders without error.

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
