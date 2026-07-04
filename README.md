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

App runs at http://localhost:3000.

## Testing

Two non-overlapping layers, both against a real local Supabase stack — never mocks, never
the shared/live project.

**One-time setup** (needs Docker Desktop running):

```bash
cd frontend
pnpm install
pnpm supabase:start                                 # starts local Postgres/Auth/REST
pnpm exec playwright install chromium --with-deps   # only needed for e2e, first time
```

**Repository tests** (vitest — proves `repositories/*.repo.ts` queries are correct against
the real schema, fast, no browser):

```bash
pnpm test:repos       # just the repository layer
pnpm test             # everything vitest covers
pnpm test:watch       # watch mode while developing — reruns on save
```

**End-to-end tests** (Playwright — drives the real app in a real browser through a real
login, ends every spec with a direct DB read to prove the record actually persisted):

```bash
pnpm supabase:reset   # first time / to get a fully clean slate (re-applies migrations)
pnpm e2e              # headless, all specs
pnpm e2e:ui           # Playwright's interactive UI — best while writing/debugging a spec
```

**When done:**

```bash
pnpm supabase:stop
```

(Fine to leave the stack running between sessions too — `supabase start` is idempotent.)
These same two suites run in CI on every push/PR (`.github/workflows/test.yml`), so this is
exactly what a green check on GitHub means. See `frontend/tests/README.md` and
`frontend/e2e/README.md` for how the isolation/safety guards work and current coverage.

## Docs

- [Architecture](docs/architecture.md)
- [UI conventions](docs/ui-conventions.md) (Sheet/Dialog/AlertDialog usage)
- [Edit concurrency](docs/edit-concurrency.md) (row-level optimistic locking + presence)
- Older docs describing the project's original Django-backed design live in
  `docs/archive/` for historical reference — they no longer describe the live system.
- The original Django REST backend (`backend/`) is kept in the repo for reference. It
  is not run, deployed, or depended on by the Next.js app — see
  [Why no backend](docs/architecture.md#why-no-backend).
