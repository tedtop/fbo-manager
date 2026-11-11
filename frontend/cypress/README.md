# Browser tests (Cypress)

Cypress is the repo's only browser-test tool (`docs/PLAN.md` D14). Vitest (`frontend/tests/`, `**/__tests__/`) stays for
unit and repository integration tests; its repository tests prove the queries are correct against a real schema.

This suite proves something different and non-overlapping: that the **UI actually calls the repository layer and the
record actually lands in the database**, driving the real Next.js app in a real browser through a real Supabase Auth
login, not mocked fetches and not a stubbed session.

It exists for the bug class repository tests structurally cannot catch: a form that renders correctly, shows no error,
and *looks* like it saved but never actually persisted (the 2026-07-03 handoff named exactly this for a POS/invoicing
ticket-entry form). Every spec ends with a direct DB read (a `cy.task` using the service-role client, bypassing the UI)
as the actual proof; the UI looking like it worked is never treated as sufficient on its own.

## Layout

| Path | What |
|---|---|
| `e2e/<area>/*.cy.ts` | Specs: `flight-operations`, `equipment`, `invoicing`, `settings`, `api`, `users`, `schedule-import` |
| `support/commands.ts` | `cy.login(role)`, `cy.pickAirport`, `cy.typeAirport` |
| `tasks/` | Node-side helpers: `env.ts` (local stack constants and the safety guard), `db.ts` (service-role client), `seed.ts` (dev accounts), `*.tasks.ts` (per-area `cy.task` implementations) |
| `../cypress.config.ts` | Registers all tasks, base URL, spec pattern |
| `../scripts/test-cypress.ts` | The one-command runner behind `pnpm test:cypress` |

## One-time setup

Same local Supabase stack as the vitest repository suite (`frontend/tests/README.md`), with Auth enabled (the login is
real, so `supabase/config.toml` has `[auth] enabled = true`).

```bash
cd frontend
pnpm install
pnpm exec cypress install   # first run only: downloads the Cypress binary
pnpm supabase:start
pnpm supabase:reset         # make sure all migrations are applied
```

## Running

```bash
pnpm test:cypress                                              # all specs, headless
pnpm test:cypress --spec 'cypress/e2e/settings/*.cy.ts'        # extra args go to `cypress run`
CYPRESS_BASE_URL=http://localhost:4350 pnpm test:cypress       # private port (another session testing on 4210)
```

`scripts/test-cypress.ts` starts its own `next dev` (default port 4210, build folder `.next-e2e/cy-<port>`, removed when
the run ends) with the local Supabase URL and the public Supabase CLI demo anon key injected from `cypress/tasks/env.ts`
(no `.env` file needed), waits for it, runs `cypress run` headless, and always stops the server it started. It never
touches the dev server on port 4000. A hand-started server needs `NEXT_DIST_DIR=.next-e2e/<name>` (keep it under
`.next-e2e/`, which Tailwind ignores); `pnpm clean:next` removes stale build folders.

The browser time zone is pinned to `America/Phoenix` (UTC-7, no DST) through `TZ`, so date and instant assertions are
deterministic. Set `TZ` yourself to try another zone. Many specs compute their expected instants with the browser's own
`Date`, so they also hold in any zone.

Interactive runner: start `next dev` by hand with all four of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY` set (the app returns 500 without them), then `pnpm cypress:open`. `pnpm cypress:seed`
creates the two dev accounts by hand.

## How auth works

The login form (`components/forms/login-form.tsx`) ships two **Quick Dev Login** buttons wired to
`admin@minutemanfbo.local` (Administrator) and `user@minutemanfbo.local` (Line Department).

1. The `seedDevUsers` task (`cypress/tasks/seed.ts`) creates those accounts through the Supabase Admin API against the
   local stack and grants the roles seeded by `supabase/migrations/20260703000200_user_management_schema.sql`.
   Idempotent, safe on an already-seeded stack.
2. `cy.login('admin' | 'user')` (default `admin`) runs that task, then clicks the real dev-login button (a real
   `signInWithPassword`, real cookies) inside `cy.session`, so the login is cached per role and replayed cheaply.
3. Most specs run as admin (full access to every module). Specs that prove *restricted* access use `cy.login('user')`.
4. `users/users-access.cy.ts` additionally creates a role-less user through the admin API (Google sign-in cannot run in
   tests, see `docs/google-signin.md`), logs that user in through the form in a second `cy.session`, and deletes the user
   afterwards.

## Safety

`assertSafeE2ETarget` (`cypress/tasks/env.ts`, same principle as `assertSafeTestTarget` in `tests/support/client.ts`)
refuses to seed users or run any DB task against anything that is not `127.0.0.1`/`localhost`, unless both
`E2E_SUPABASE_URL` and `E2E_ALLOW_REMOTE=yes-i-am-sure` are set. This suite creates real records through the real app:
**never point it at a shared or production Supabase project.**

## Test data

Specs do **not** wipe the database between runs (that would delete the seeded auth users and log every session out).
Each spec generates unique fixture values (a per-run stamp in tails, names, SKUs) and removes the rows it created in
`after()`. Run `pnpm supabase:reset` for a fully clean slate; the next run re-seeds the dev accounts automatically.
Write waits as retry-able assertions or `cy.intercept` aliases, not fixed `cy.wait(ms)`.

## Coverage

| Flow | Spec (`cypress/e2e/…`) | Notes |
|---|---|---|
| Equipment: create, edit | `equipment/equipment.cy.ts` | Simple CRUD form: the baseline smoke test that proves the whole pipeline (login, form, DB) works |
| Invoicing: digital fuel ticket, "Complete ticket" | `invoicing/fuel-ticket.cy.ts` | Highest priority, the exact bug class named in the 2026-07-03 handoff. Verifies the invoice, its line item, *and* the fueling event (`truck_meter_readings`) created as a side effect, plus the `invoice_number` stamped back onto that reading |
| Settings: tail number prefix | `settings/tail-prefix.cy.ts` | N prefill, suggestions stay closed until typed after the prefix, prefix-only save refused, change to `C-` persists, invalid prefix rejected, empty prefix means no prefill |
| Settings: home airport picker | `settings/airport-picker.cy.ts` | GPI lists Glacier Park before Guapi, picking saves KGPI and survives a reload; an unknown strip is used as typed |
| API auth | `api/api-auth.cy.ts` | Anonymous callers get 401 on every protected route; a signed-in admin passes the gate (400 for a bad tail, OCR routes not 401/403) |
| New sign-up access | `users/users-access.cy.ts` | Role-less user (admin API, Google cannot run here) is held on `/pending`, `/users` bounces; admin promotes them in Users and the DB shows the assignment with `assigned_by`; the login page offers Continue with Google. See `docs/google-signin.md` |
| Schedule sheet import (B45b) | `schedule-import/schedule-import.cy.ts` | OCR route and registry lookup stubbed with `cy.intercept` (no Anthropic or adsbdb call): six printed legs become four flights, Unpair, a 502 message, import writes flights (instants in the app's America/Denver schedule zone, QT, `front-desk`), aircraft types from the lookup, services, a re-scan adds nothing, plus a 390px pass |
| Board: list views and filters | `flight-operations/board.cy.ts`, `smoke.cy.ts`, `empty-states.cy.ts`, `states.cy.ts` | Seeded flights, split/arrivals/departures toggle, tail search, status and services filters, date range (Today + Future default, Today, Tomorrow, All Dates, bounded fetch), calendar week navigation (also > 4 weeks ahead), empty states, failed fetch with Retry, previous flights kept while refetching |
| Board: hide finished flights (B43b) | `flight-operations/hide.cy.ts` | Hide / Unhide, Show hidden, stale Hide refused with a toast, Departed hides from the next day |
| Board: linked hover (B42) | `flight-operations/linked-hover.cy.ts` | One flight in both columns highlights both cards |
| Board: realtime (B16) | `flight-operations/realtime.cy.ts` | Insert, update and soft delete made elsewhere show up without a reload |
| Add Flight | `flight-operations/flight-create.cy.ts` | New tail creates the aircraft; QT departure = arrival + 1 h; arrival-only and departure-only store NULL for the other time; actual times; inline validation with no `alert()`; failed insert toast keeps the sheet open and retry succeeds; 23:30 local keeps its date after reload |
| Flight edit, status, delete, conflict | `flight-operations/flight-edit.cy.ts` | Edit persists, fuel order notes survive an unrelated edit, status dropdown offers only real statuses and persists, Delete confirmation (cancel leaves the row, confirm soft-deletes), edit conflict UI (keep theirs / overwrite), stale status change, failed edit and failed status change toasts |
| Airports on the flight form | `flight-operations/flight-airports.cy.ts` | Picker ordering, KGPI stored and shown as GPI, home airport prefilled on the known end and never over a pick, Clear saves empty, first match preselected (Enter / arrows) |
| Timezone (B10) | `flight-operations/timezone.cy.ts` | Seeded 23:30 to 00:30 flight round-trips through the edit form, a changed departure lands on the right instant (asserts the browser offset is America/Phoenix) |
| Service catalog (B26) | `flight-operations/flight-services.cy.ts` | Pills on card and junction, edit preselects, toolbar filter, billable-only products never appear, catalog fetch failure, TKS Fluid gallons, no false concurrency conflict after a services edit |
| Phone layout (390x844) | `flight-operations/mobile.cy.ts` | Key flows on a phone; pins the sideways-scroll bug M1 |

## Known bugs pinned in tests

Assertions that flip when the fix lands (`grep -rn "KNOWN BUG\|NOT YET" cypress/ components/**/__tests__ repositories/__tests__`):

- M1 mobile layout (B39): `flight-operations/mobile.cy.ts` asserts the page is wider than 390px.
- F9 creator attribution (B17): `repositories/__tests__/flights.repo.test.ts`; the form never sends `created_by_id`, so the DB default (user 1) is used.
- Card staleness (B44, no finding id): `flight-operations/flight-edit.cy.ts`. The card seeds notes/services from props once.

Known flaky (kept strict on purpose, not hidden behind retries): `settings/tail-prefix.cy.ts` "an empty prefix means no
prefill" fails about one run in five. The tail field stays `N` although the saved prefix is empty, so a late-arriving
prefix is not swapped into an Add Flight sheet that opened while settings were still loading (see the swap effect in
`components/flight-operations/flight-form-dialog.tsx`). The spec waits for the `app_setting` response before opening the
sheet, which narrows but does not remove it. Treat a failure as a likely real race, not noise.

Fixed and now asserted as correct behavior: F1 (QT / classification), F2 and F5 (timezone, calendar window), F3 (fuel
order notes, no en-route status), F4 (date range filter, bounded fetch), F6 and F7 (error toasts, delete confirmation, no
console noise), and soft-delete semantics. F10 (realtime, B16), F11, F12, F13 and F15 remain open.

## Not yet covered (2026-11-11)

Covered today: the flight board and its forms, equipment, the digital fuel ticket (happy path), settings (tail prefix,
home airport), API auth, user access (sign-up to promotion), schedule import, and three truck-sheet specs (DPI, PDF,
scans). Vitest (`tests/`, `**/__tests__/`) covers queries and pure rules for the rest, but no browser test proves those
screens persist what they show. Gaps, in suggested order:

**Write now (independent of the fuel flow)**
- `line-schedule`: add, edit and delete a shift; coverage strip; the Hourly view; schedule scan import.
- `users` beyond promotion: create, edit role, deactivate; access checks per module (`cy.login('user')` should be bounced
  from admin-only pages).
- `parking`: place an aircraft in a parking area; clear it (after B55 settles the plane list).
- `training`: trainings and certifications create/edit (certifications live on users).
- `settings` beyond the two tested keys: equipment types, name display, airport display.
- `docs` module: open the panel from the flight form, scroll to an anchor, close it (plan in `docs/PLAN.md` section 5).
- Behaviour tests for the `qt`, `aircraft` and `ocr` API routes (today they only get the 401/403 auth check).

**Wait for the fuel flow (how fuel is requested, filled and billed is still being decided; tests written now would be
rewritten)**
- `fuel-dispatch` / `dispatch`: request, assign, fill, complete.
- `fuel-farm`: tank readings entry, gravity QC, trend widget.
- `invoicing` beyond the one happy path: draft-save, settle, void, billing of services and ramp fees (B26).
- `truck-sheets` manual entry and the reconciliation with invoices.
- Fuelers (the table is a relic; fuelers are Line Department users identified by initials).

The expensive part (seeded auth, session reuse, DB-proof tasks) is done: covering another screen is one spec following
`equipment/equipment.cy.ts`, plus its tasks in `tasks/<area>.tasks.ts`. Prioritize by risk: forms with multi-step writes
are worth more than single-table CRUD, which the vitest repository suite already proves at the query level.
