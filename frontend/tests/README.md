# Repository integration tests

`frontend/repositories/*.repo.ts` is the Supabase data-access layer — every function takes a
`SupabaseClient<Database>` and does a `.from(table)...` query. The tests in
`frontend/repositories/__tests__/` exercise these functions against a **real, disposable local
Supabase/PostgREST instance**, not mocks and not the shared live project database.

Why a real DB instead of mocking `SupabaseClient`: several real bugs have slipped past code
review because the mismatch only shows up at query time — a query against a table that doesn't
exist, a `select()` embed referencing the wrong FK relationship, an enum value the DB `CHECK`
constraint rejects. Mocking the client would make all of these tests pass trivially while the
bug ships. Running against a real Postgres + PostgREST stack makes the tests fail the way the
app would actually fail.

## One-time setup

The local stack is the standard Supabase CLI dev environment, scaffolded under
`frontend/supabase/` (config + migrations), and requires Docker.

```bash
cd frontend
pnpm install
pnpm supabase:start   # pulls/starts a local postgres+postgrest+kong stack (first run only)
```

`pnpm supabase:start` prints connection info; the tests already know the local defaults
(`http://127.0.0.1:54321` + the standard Supabase CLI local demo keys — these are public,
not secrets, see `tests/support/client.ts`) so no `.env` setup is required to run them locally.

## Running the tests

```bash
pnpm test              # everything
pnpm test:repos        # just the repository layer
pnpm test:watch        # watch mode
```

Stop the stack when you're done (or leave it running between sessions — `supabase start` is
idempotent):

```bash
pnpm supabase:stop
```

## How isolation works

- `frontend/supabase/migrations/*.sql` defines the schema. It mirrors `frontend/types/database.ts`
  (the hand-maintained snapshot of the live project schema) — **when you add/change a column or
  table in a repository, update both together**, or the test DB silently drifts from reality and
  stops catching the class of bug it exists for.
- `tests/support/reset.ts` truncates every table (children-before-parents, FK-safe) in a
  `beforeEach`. Every test starts from an empty database and builds exactly the rows it needs —
  no tagging/cleaning up rows in a shared dataset, no cross-test leakage.
- `tests/support/factories.ts` has small helpers (`makeUser`, `makeAircraft`, `makeFueler`, ...)
  for the common FK-heavy setup (e.g. a `flight` needs an `aircraft` and a `users` row). They
  call the repository `create*` functions themselves, so fixture setup doubles as extra coverage
  of those functions.
- Test files run sequentially (`fileParallelism: false` in `vitest.config.ts`) because they share
  one local database — running them concurrently would let one file's reset wipe rows another
  file is mid-assertion on.

## Pointing at a different Postgres/PostgREST instance (e.g. CI)

Override the defaults with env vars if you don't want to run the Supabase CLI stack directly:

```bash
SUPABASE_TEST_URL=http://localhost:54321 \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
pnpm test:repos
```

## Coverage

All repository files present on `master` as of this writing have integration tests **except**
the ones added by the concurrent user-management/training-compliance rebuild (`profiles.repo.ts`,
`roles.repo.ts`, `staff.repo.ts`, `user-roles.repo.ts`, `training-courses.repo.ts`,
`training-completions.repo.ts`). Those introduce a different, UUID-keyed `profiles`/`roles`/
`user_roles`/`module_permissions`/`department_member` schema (backed by Supabase Auth) that
this migration doesn't model yet — deliberately left out of this pass rather than guessing at
an auth-integrated schema; a good next slice of work.

The "digital fuel tickets" invoicing rebuild that landed mid-session (`customers.repo.ts`,
`products.repo.ts`, `fueling-events.repo.ts`, `invoices.repo.ts`) **is** covered — see
`frontend/supabase/migrations/20260703000100_invoicing_v2_schema.sql` and
`repositories/__tests__/invoices.repo.test.ts`. This is the module the 2026-07-03 handoff
flagged as previously silently failing to persist a POS ticket; `createInvoice`'s multi-step
write (fueling event → invoice → line items → gauge readings, with best-effort rollback since
supabase-js has no client transactions) now has passing tests exercising the draft/finalize,
on-account, join, settle, void, and delete-draft paths end to end against a real DB.
