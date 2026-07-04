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

```bash
cd frontend
pnpm test:repos   # vitest — repository layer against a real local Supabase stack
pnpm e2e          # Playwright — drives the real app end to end, verifies DB persistence
```

See `frontend/tests/README.md` and `frontend/e2e/README.md` for setup details and
current coverage.

## Docs

- [Architecture](docs/architecture.md)
- [UI conventions](docs/ui-conventions.md) (Sheet/Dialog/AlertDialog usage)
- [Edit concurrency](docs/edit-concurrency.md) (row-level optimistic locking + presence)
- Older docs describing the project's original Django-backed design live in
  `docs/archive/` for historical reference — they no longer describe the live system.
- The original Django REST backend (`backend/`) is kept in the repo for reference. It
  is not run, deployed, or depended on by the Next.js app — see
  [Why no backend](docs/architecture.md#why-no-backend).
