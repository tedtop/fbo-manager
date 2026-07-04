# End-to-end tests (Playwright)

`frontend/tests/` (vitest) proves the repository layer's queries are correct against a real
schema. This directory proves something different and non-overlapping: that the **UI actually
calls the repository layer and the record actually lands in the database** — driving the real
Next.js app in a real browser through a real Supabase Auth login, not mocked fetches and not a
stubbed session.

This exists specifically for the bug class repository tests structurally cannot catch: a form
that renders correctly, shows no error, and *looks* like it saved — but never actually persisted.
The 2026-07-03 session handoff named exactly this: *"a POS/invoicing ticket-entry form that
renders and looks correct but silently doesn't persist to the database."* Every spec here ends
with a direct DB read (service-role client, bypassing the UI entirely) as the actual proof —
the UI "looking like it worked" is never treated as sufficient on its own.

## One-time setup

Same local Supabase stack as the vitest repo suite (`frontend/tests/README.md`), with Auth
enabled — the E2E layer logs in for real, so `supabase/config.toml` has `[auth] enabled = true`
here (the vitest suite doesn't need it, but doesn't mind it being on either).

```bash
cd frontend
pnpm install
pnpm exec playwright install chromium --with-deps   # first run only
pnpm supabase:start
pnpm supabase:reset    # make sure all migrations (incl. user-management) are applied
```

## Running

```bash
pnpm e2e            # headless, all specs
pnpm e2e:ui          # Playwright's interactive UI mode — best for writing/debugging specs
```

No `.env` file needed — `playwright.config.ts` launches `next dev` itself with
`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` injected directly, pointed at the
local stack (`e2e/support/env.ts`), on port 3100 so it never collides with a real `pnpm dev`.

## How auth works

The login form (`components/forms/login-form.tsx`) already ships two **"Quick Dev Login"**
buttons wired to `admin@fbo.local` / `user@fbo.local`. `e2e/global-setup.ts` runs once before
the whole suite:

1. `e2e/support/seed.ts` creates those two accounts via the Supabase Admin API against the
   local stack (idempotent — safe to run against an already-seeded stack) and grants them
   roles from `frontend/scripts/user-management-schema.sql` (Administrator / Line Technician),
   which is applied as `supabase/migrations/20260703000200_user_management_schema.sql`.
2. For each account, launches a real browser, clicks the real dev-login button (a real
   `supabase.auth.signInWithPassword` call, real cookies), and saves the session to
   `e2e/.auth/{admin,user}.json` (gitignored).
3. Specs pick a saved session via Playwright `projects` in `playwright.config.ts` — most
   specs run under the `admin` project (full access to every module); specs that need to prove
   *restricted* access belong under `e2e/user-role/**` and run against the `line-technician`
   project instead.

## Safety

Same principle as the vitest suite's `assertSafeTestTarget` (`tests/support/client.ts`):
`e2e/support/env.ts`'s `assertSafeE2ETarget` refuses to seed users or run against anything
that isn't `127.0.0.1`/`localhost` unless both `E2E_SUPABASE_URL` and
`E2E_ALLOW_REMOTE=yes-i-am-sure` are set explicitly. This suite creates real records through
the real app — never point it at a shared or production project.

## Test data

Unlike the vitest repo suite, specs here do **not** wipe the database between runs — doing so
would delete the seeded auth users/profiles/roles and log every session out mid-suite. Instead,
every spec generates unique fixture values (`e2e/support/unique.ts`, mirroring
`tests/support/factories.ts`'s pattern) so repeated runs against the same persistent local DB
never collide. Periodically `pnpm supabase:reset` for a fully clean slate (global-setup
re-seeds the dev accounts automatically on the next run).

## UI conventions checked by every spec

Alongside persistence, each form spec calls `expectConventionalSheet` (`e2e/support/ui.ts`),
which asserts the form opened as a right-side `Sheet` slide-out (docs/ui-conventions.md) whose
panel background matches the active theme. The theme half exists because sheets portal to
`<body>`: a theme class scoped anywhere below `<html>` leaves every slide-out light-themed in
dark mode (the 2026-07-04 bug). `theme.e2e.ts` additionally proves the sheet shell in **both**
themes via the real nav toggle.

## Coverage

| Flow | Spec | Notes |
|---|---|---|
| Equipment: create, edit | `equipment.e2e.ts` | Simple CRUD form — the baseline smoke test proving the whole pipeline (login → form → DB) works |
| Theme/slide-out conventions, both modes | `theme.e2e.ts` | Representative sheet (equipment) in dark AND light |
| Flights: create, edit, status transition | `flights.e2e.ts` | Create covers the aircraft-via-tail-number-autocomplete path (the only way aircraft are created) and the aircraft-type update-back |
| Fuel farm: tank create/edit, level entry | `fuel-farm.e2e.ts` | Level entry writes `tank_level_readings` (the app's own table — the externally-owned `fuel_tank_readings` is never touched) |
| Training: course create, completion recording | `training.e2e.ts` | Completion recorded through the compliance-matrix cell; asserts the cell re-renders from the persisted row |
| Fuel dispatch: order create, concurrent-edit conflict, fueler assignment | `fuel-dispatch.e2e.ts` | Conflict test drives the real compare-and-swap guard end-to-end through the conflict dialog (docs/edit-concurrency.md) |
| Truck sheets: import review → commit | `truck-sheets.e2e.ts` | Only the external OCR fetch is route-stubbed; review edits, truck auto-creation, and both table writes are real |
| User management: role create, invite, profile edit | `users.e2e.ts` | Invite goes through the server-side admin API route |
| User management: restricted access | `user-role/users-restricted.e2e.ts` | Runs under the `line-technician` project; checks the page shell AND the API reject non-admins |
| Invoicing: digital fuel ticket, "Complete ticket" | `invoicing.e2e.ts` | Highest priority — the exact form/bug class named in the 2026-07-03 handoff. Verifies the invoice, its line item, *and* the fueling event (`truck_meter_readings`) it creates as a side effect, plus the `invoice_number` stamped back onto that reading |
| Invoicing: draft save → finalize, settle, void | `invoicing-flows.e2e.ts` | The three status-mutating lifecycle flows |

**Deliberately not covered** — the parking module. It is frozen (audit-only per
`.omc/specs/deep-interview-fbo-manager-modules.md`) and its only write paths run through the
Mapbox WebGL canvas (drag/draw), which isn't DOM-addressable; a canvas-coordinate test against
a module whose UX must not change would be all brittleness, no protection.

## Parallel local stacks

The Supabase CLI keys containers on `supabase/config.toml`'s `project_id` — two checkouts
sharing `project_id = "frontend"` will silently replace each other's stack on `supabase start`
/ `db reset`. If another session/worktree needs its own stack at the same time, locally change
`project_id` and the ports in its `config.toml` (don't commit that) and point the suite at it:
`E2E_SUPABASE_URL=http://127.0.0.1:<api-port> pnpm e2e` — `e2e/support/env.ts` reads the
override, and the safety guard still only allows loopback.
