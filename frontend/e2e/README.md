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
local stack (`e2e/support/env.ts`), on port 4100 so it never collides with a real `pnpm dev`.

## How auth works

The login form (`components/forms/login-form.tsx`) already ships two **"Quick Dev Login"**
buttons wired to `admin@fbo.local` / `user@fbo.local`. `e2e/global-setup.ts` runs once before
the whole suite:

1. `e2e/support/seed.ts` creates those two accounts via the Supabase Admin API against the
   local stack (idempotent — safe to run against an already-seeded stack) and grants them
   roles (Administrator / Line Department) seeded by
   `supabase/migrations/20260703000200_user_management_schema.sql`.
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

## Coverage

| Flow | Spec | Notes |
|---|---|---|
| Equipment: create | `equipment.e2e.ts` | Simple CRUD form — the baseline smoke test proving the whole pipeline (login → form → DB) works |
| Equipment: edit | `equipment.e2e.ts` | |
| Invoicing: digital fuel ticket, "Complete ticket" | `invoicing.e2e.ts` | Highest priority — the exact form/bug class named in the 2026-07-03 handoff. Verifies the invoice, its line item, *and* the fueling event (`truck_meter_readings`) it creates as a side effect, plus the `invoice_number` stamped back onto that reading |
| Flight board: seeded flights display, split/arrivals/departures toggle, tail-number search, status filter, date range (Today/Today + Future/Tomorrow/All Dates), Hide / Unhide, Show hidden, Departed hides from the next day (B43b) | `flight-board.e2e.ts` | Seeds via service role, cleans up its own rows. The default is Today + Future (open-ended: a flight 30 days out is shown); Today, Tomorrow and week fetches are bounded (local yesterday to +14 days); "All Dates" is the unbounded fetch |
| Flight create: Add Flight sheet persists real rows | `flight-create.e2e.ts` | New tail creates the aircraft (ICAO GLF6 via the type combobox); QT departure = arrival + 1 h saved as a quick turn; arrival-only and departure-only (hangar pull) store a NULL other time and show in one column; actual times saved and shown; inline validation (no scheduled time, no aircraft type) with no `alert()`; failed insert shows an error toast, keeps the sheet open, retry succeeds. Times asserted as real instants (browser zone pinned to America/Phoenix, UTC-7). Relies on local migration `20261102000500` (flight.created_by_id default 1, live parity) |
| Flight edit: edit, status, delete, conflict | `flight-edit.e2e.ts` | Edit sheet persists changed fields; fuel order notes persist and survive an unrelated edit; status dropdown offers only real DB statuses and persists; Delete asks an AlertDialog confirmation, cancel leaves card and row untouched, confirm soft-deletes (`deleted_at` set, row kept); edit-concurrency conflict UI keeps the other write; failed edit and failed status change show an error toast and write nothing |
| New sign-up access: pending page, promotion from Users | `users-access.e2e.ts` | Creates a role-less user through the admin API (Google cannot run here); profile gets the Google-style name split; sign-in lands on `/pending`, `/users` bounces back; admin promotes them in Users (Role column) and the database shows the assignment with `assigned_by`; Check again then lets them in while Users stays closed. Also asserts the login page offers Continue with Google. See `docs/google-signin.md` |
| Flight timezone (B10) | `flight-timezone.e2e.ts` | Browser zone pinned to America/Phoenix; a 23:30 local entry keeps its date and time after reload and an edit does not shift it; editing a 23:30 to 00:30 flight round-trips; calendar navigation loads the visible week more than 4 weeks ahead. Asserts DB instants, board card labels and form fields |
| Schedule sheet import (B45b) | `schedule-import.e2e.ts` | OCR route and registry lookup are stubbed (no Anthropic or adsbdb call): six printed legs become four flights, Unpair, a 502 message, import writes flights (instants, QT, `front-desk`), aircraft types from the lookup (not the printed text), services, a re-scan adds nothing, plus a 390px pass. Run on a private port, e.g. `E2E_BASE_URL=http://localhost:4350 NEXT_DIST_DIR=.next-e2e/schedule-import pnpm exec playwright test e2e/schedule-import.e2e.ts --project=admin` |

Arrivals/departures is also covered by Cypress (`cypress/e2e/flight-operations/*.cy.ts`, port 4210, see the root README):
board, create, edit and a 390px mobile pass. The Cypress specs mirror these Playwright specs.

**Still pinned as `KNOWN BUG`** (assertions that flip when the fix lands; grep `KNOWN BUG` in
`e2e/`, `cypress/`, `components/**/__tests__`, `repositories/__tests__`):

- M1 mobile layout (B39): `cypress/e2e/flight-operations/mobile.cy.ts` asserts the page is wider than 390px.
- F9 creator attribution (B17): `repositories/__tests__/flights.repo.test.ts`; the form never sends `created_by_id`, so the DB default (user 1) is used.
- Card staleness (found with B08, no finding id): `flight-edit.e2e.ts` and `flight-edit.cy.ts`. The card seeds notes/services from props once, so after an edit it shows the old values until reload.

Fixed and now asserted as correct behavior: F1 (QT / classification), F2 and F5 (timezone, calendar
window), F3 (fuel order notes, no en-route status), F4 (date range filter, bounded fetch), F6 and F7
(error toasts, delete confirmation, no console noise), and soft-delete semantics. F10 (realtime, B16),
F11, F12, F13 and F15 remain open.

**Not yet covered** — every other create/edit form in the app (aircraft, parking
locations, tanks/tank readings, trainings/certifications, fuelers, truck sheets manual entry,
transactions/fuel-dispatch, user management, training-compliance module, invoicing draft-save
and settle/void flows). The infrastructure this PR adds (seeded auth, storage-state reuse, DB
verification helpers) is the expensive part and is done — extending coverage to another form is
now a matter of writing one spec per form following `equipment.e2e.ts`'s pattern, not more
plumbing. Prioritize by risk: forms with complex multi-step writes (like invoicing's) are worth
more than simple single-table CRUD forms, which the vitest repo suite already indirectly proves
work at the query level.

## Build folders

Each test server needs its own Next.js build folder because `pnpm dev` holds `.next`. This is automatic:
Playwright uses `.next-e2e/pw-<port>` and `pnpm test:cypress` uses `.next-e2e/cy-<port>` (deleted when the
run ends). If you start a server by hand, set `NEXT_DIST_DIR=.next-e2e/<name>`: keep it under `.next-e2e/`,
which Tailwind ignores. `pnpm clean:next` removes stale ones (`--dry-run` lists them, `--force` removes all).
