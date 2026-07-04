# Decouple Next.js Frontend from Django → Direct Supabase Integration

## Context

The fbo-manager frontend (Next.js 16) currently routes all data through a Django REST backend that connects to a Supabase-hosted PostgreSQL database. This creates unnecessary coupling — every feature change requires coordinated edits across both codebases. The Django backend will remain in the repo but the frontend will bypass it entirely, interfacing directly with Supabase for auth, data access, and business logic. This also gives us the opportunity to properly leverage TanStack React Query (already installed but unused) and establish a clean layered architecture.

## Architecture

Four layers, each with one job:

```
Components (view)  →  Hooks (React Query)  →  Repositories (data access)  →  Supabase Client
                                           →  Services (business logic)   →  Repositories
```

### Folder structure (inside `frontend/apps/web/`)

```
lib/
  supabase/
    client.ts                 # Browser client (singleton via @supabase/ssr)
    server.ts                 # Server-side client (Server Actions, RSC)
    middleware.ts              # Session refresh in Next.js middleware

types/
  database.ts                 # Auto-generated: `supabase gen types typescript`
  domain/
    flights.ts                # camelCase domain types + mappers (toFlightDomain, toFlightInsert)
    tanks.ts
    certifications.ts
    transactions.ts
    equipment.ts
    (others as needed)

repositories/                  # Pure Supabase queries. No React. No state.
  flights.repo.ts              # Every fn takes SupabaseClient as 1st arg
  aircraft.repo.ts
  tanks.repo.ts
  tank-readings.repo.ts
  transactions.repo.ts
  fueler-assignments.repo.ts
  certifications.repo.ts
  training-history.repo.ts
  assigned-training.repo.ts
  equipment.repo.ts
  parking.repo.ts
  fuelers.repo.ts
  line-schedules.repo.ts
  users.repo.ts
  invoices.repo.ts

services/                      # Multi-table operations, business rules
  certifications.service.ts    # completeCertification() — upsert + audit trail
  transactions.service.ts      # assignFueler(), removeFueler(), updateProgress()
  parking.service.ts           # softDelete (set display_order=0)

hooks/                         # TanStack React Query wrappers
  use-flights.ts               # useQuery + useMutation, query key factories
  use-aircraft.ts
  use-tanks.ts
  ... (one per domain)
```

### Layer rules

- **Repositories**: Export plain functions (not classes). Every function takes `SupabaseClient<Database>` as first param. Return raw DB row types. Throw on error. Handle JOINs via Supabase's `select()` relation syntax.
- **Services**: Orchestrate multi-table operations. Accept raw types, return domain types. Stateless. For transactional operations (training completion), use Supabase RPC calling a PostgreSQL function.
- **Hooks**: Use `useQuery` for reads, `useMutation` for writes. Each domain gets a query key factory (`flightKeys.all`, `flightKeys.list(filters)`, etc.). Mutations invalidate relevant query keys. No manual `useState` for loading/error/data.
- **Domain types**: Only create domain types when component shape differs from DB row (computed fields, camelCase transformation, reshaped structure). Simple CRUD domains (aircraft, equipment) can use DB row types directly.

### Auth: Supabase Auth (replacing NextAuth)

- Install `@supabase/supabase-js` and `@supabase/ssr`
- `lib/supabase/client.ts`: `createBrowserClient(url, anonKey)` singleton
- `lib/supabase/server.ts`: `createServerClient(url, anonKey, { cookies })` for Server Actions
- `lib/supabase/middleware.ts`: Refresh session on every request via Next.js middleware
- Replace `AuthProvider` (NextAuth `SessionProvider`) in layout with Supabase session handling
- Delete `lib/auth.ts`, `next-auth.d.ts`, `app/api/auth/[...nextauth]/route.ts`
- Rewrite all server actions (`actions/*.ts`) to use Supabase Auth/client
- One-time user migration: create Supabase Auth entries, force password reset

### Business logic relocation

| Logic | Current location | New location |
|-------|-----------------|--------------|
| Expiry status (days until, thresholds) | Django serializer | `types/domain/certifications.ts` mapper |
| Tank level % and status | Django serializer | `types/domain/tanks.ts` mapper |
| Maintenance status | Django serializer | `types/domain/equipment.ts` mapper |
| Flight type/duration derivation | `components/flight-operations/types.ts` | `types/domain/flights.ts` (move file) |
| Training completion (upsert + history) | Django viewset | Supabase RPC (`complete_certification` PG function) called via `services/certifications.service.ts` |
| Fueler assign/remove + timestamp mgmt | Django viewset | `services/transactions.service.ts` |
| Transaction progress + completed_at | Django viewset | `services/transactions.service.ts` |
| Parking soft delete | Django viewset | `repositories/parking.repo.ts` (update display_order=0) |
| Query filtering (dates, status, etc.) | Django viewset `get_queryset()` | Repository functions with filter params |
| Form validation | Django serializer | Zod schemas in `lib/validation.ts` (extend existing) |

## Implementation Phases

### Phase 1: Foundation
1. Install `@supabase/supabase-js`, `@supabase/ssr`
2. Generate types: `supabase gen types typescript --project-id <id> > types/database.ts`
3. Create `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
4. Set up Next.js middleware for session refresh
5. Replace NextAuth with Supabase Auth in layout and providers
6. Rewrite server actions (`register`, `profile`, `change-password`, `delete-account`)
7. Delete `lib/auth.ts`, `next-auth.d.ts`, NextAuth API route
8. Update `.env` / `.env.example` (remove `NEXTAUTH_*`, `API_URL` vars; keep `SUPABASE_*`)

**Key files to modify:**
- `app/layout.tsx` — swap AuthProvider
- `providers/auth-provider.tsx` — replace or delete
- `actions/*.ts` — rewrite all 4
- `middleware.ts` — create new
- `package.json` — add supabase deps, remove next-auth

### Phase 2: Simple CRUD domains (establish patterns)
1. **Aircraft** — simplest domain, no computed fields, no JOINs. Create `repositories/aircraft.repo.ts` + `hooks/use-aircraft.ts`
2. **Equipment** — adds computed field (maintenance_status). Create repo + `types/domain/equipment.ts` + hook
3. **Parking** — adds soft-delete logic. Create repo + `services/parking.service.ts` + hook

### Phase 3: Fuel farm
1. **Tanks** — JOIN with `tank_level_readings` for latest reading, computed level %. Create repo + domain type + hook
2. **Tank readings** — read-only historical data. Create repo + hook

### Phase 4: Flights (most complex domain)
1. **Flights** — complex JOINs (aircraft, parking_location, users), complex mappers, date filtering
2. Create `repositories/flights.repo.ts` with relation queries
3. Move mapper logic from `components/flight-operations/types.ts` to `types/domain/flights.ts`
4. Rewrite `hooks/use-flights.ts` with React Query
5. Update flight operation components to use new mutation API (`useCreateFlight()`, `useUpdateFlight()`, `useDeleteFlight()`)

### Phase 5: Training & Certifications
1. Create PostgreSQL function `complete_certification(...)` in Supabase for atomic upsert + history
2. **Certifications** — repo + service (calls RPC) + domain type + hook
3. **Training history** — repo + hook
4. **Assigned training** — repo + hook (with `complete` action)
5. **Fuelers** — repo + hook
6. **Trainings** (course definitions) — repo + hook

### Phase 6: Transactions
1. **Transactions** — repo + service (assign/remove/progress) + hook
2. **Fueler assignments** — junction table logic in transactions service

### Phase 7: Remaining domains
1. **Users** — repo + hook (profile, user list for admin)
2. **Line schedules** — repo + hook (M2M with users and equipment via junction tables)
3. **Invoicing** — customers, products, invoices, invoice items repos + hooks

### Phase 8: Cleanup
1. Remove `lib/api.ts`, `lib/fbo-api.ts`
2. Remove or archive `@frontend/types/api` package
3. Remove `next-auth` from `package.json`
4. Clean up `next.config.ts` (remove API_URL references, any backend proxies)
5. Set up Supabase RLS policies for production security
6. Update `docker-compose.yaml` — frontend no longer depends on API service

## What stays unchanged
- `hooks/use-qt-dispatch.ts` and `app/api/qt/*` routes (already decoupled, proxy to external QT API)
- `lib/aircraft-types.ts`, `lib/aircraft-sizes.ts`, `lib/point-in-polygon.ts`, `lib/forms.ts` (pure utilities)
- `lib/validation.ts` (Zod schemas — will be extended, not replaced)
- `components/` directory structure (components use hooks, hooks change internally but API stays similar)
- `providers/query-provider.tsx` (TanStack Query provider stays)
- Django backend code (kept in repo, just no longer called)

## Verification

After each phase:
1. Run `pnpm tsc --noEmit` to verify type safety
2. Start dev server (`pnpm dev`) and test affected pages in browser
3. Verify auth flow: login, session persistence across refresh, logout
4. Verify CRUD operations work for each migrated domain
5. Check browser network tab — no requests should go to `localhost:8000`
6. After Phase 8: verify `docker compose up` works with only the web service (no api dependency)
