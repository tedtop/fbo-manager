# PLAN: Arrivals/Departures board (flight-operations)

Goal: Ted can use the board daily, ASAP. Working style: screen-by-screen; finish this screen before the next. Origin: 2026-11-02 (branch `feature/flight-edit-concurrency`, PR #43). Backlog: `BACKLOG.md`.

## Scope (module files)
`frontend/app/page.tsx` (the real board, route `/`), `components/flight-operations/*`, `app/flight-operations/{split-view,day-view,week-view}`, `app/flight-ops`, `hooks/use-flights.ts`, `repositories/flights.repo.ts`, tests in `repositories/__tests__/flights.repo.test.ts` and `e2e/`.

## Test tooling (verified)
- vitest 3 (`vitest.config.ts`): `environment: node`, includes only `**/__tests__/**/*.test.ts`, sequential, real local Supabase (no mocks). No jsdom, no @testing-library installed. So "component tests" would need new devDependencies; avoid.
- Playwright e2e (`e2e/*.e2e.ts`, `playwright.config.ts`): starts its own `next dev` on :3100 against local Supabase `127.0.0.1:54321`; `global-setup.ts` seeds `admin@fbo.local`/`user@fbo.local` and saves storage state (project `admin`); specs seed rows with the service-role client from `e2e/support/db.ts`, use `uniqueValue()`, drive the UI and finish with a direct DB read (`waitForDbRow`). Pattern to copy: `e2e/equipment.e2e.ts`.
- Decision D1: board suite = (a) vitest pure-logic tests for the adapter (`types.ts`) and filtering (extracted pure functions), (b) vitest repo tests for flights (extend existing), (c) Playwright e2e for UI flows. No jsdom.
- Environment caveat: Docker currently runs a different project's Supabase stack ("ski-jobs") on ports 54321/54322, so the fbo local stack is not up. e2e/repo tests need `pnpm supabase:stop` there (Ted's call) or a `supabase/config.toml` port change. See risk R1.

## Audit findings (file:line, verified by reading)
Real bugs:
- F1 Every flight lands in BOTH columns. `flight.departure_time` is NOT NULL (test_schema.sql:162) and the form fabricates departure = arrival+45min for arrival-only flights (flight-form-dialog.tsx:242-247), so the adapter always sees both times and sets `type='quick_turn'` (types.ts:164-168), and the board puts quick_turn in both lists (flight-board.tsx:65-79). Arrivals vs departures filtering is effectively broken. Needs a real model decision (D2).
- F2 Naive timestamps: form builds `${date}T${time}:00` with no timezone (flight-form-dialog.tsx:203-208); fallback departure is computed local then `.toISOString().slice(0,16)` (UTC, no zone) (:246). DB interprets as UTC, UI renders local. Times shift by the UTC offset after reload.
- F3 `fuel_order_notes` and `location_id` are read by the adapter's input but never mapped to `Flight` (types.ts:191-214) and `fuelOrderNotes` is never sent on update (types.ts:218-290); `en-route` status silently becomes `scheduled` (types.ts:130-131) while the card still offers it (flight-card.tsx:339-359).
- F4 `dateRange` filter (today/tomorrow/week/all) is shown in the toolbar (compact-toolbar.tsx:225) but never applied (flight-board.tsx:32-62; page.tsx:54). `weekInternalFlights` computed and unused (page.tsx:167-180). Split view loads ALL flights unfiltered (page.tsx:44), so the board grows forever.
- F5 Calendar window fixed at today +-28 days (page.tsx:31-44) regardless of `weekOffset`; navigating past 4 weeks shows an empty calendar. Date strings built via `toISOString().split('T')` (UTC date; wrong near midnight local). `findAllFlights` end bound `${endDate}T23:59:59` has no zone (flights.repo.ts:475). Week-view route computes a different week start (today+offset*7) than the calendar (Sunday start) (week-view/page.tsx:628-640 vs calendar-week-view.tsx:111-113).
- F6 Errors are swallowed: create/update/delete failures only `console.error` (page.tsx:92-123); fuel-order failure same (:136-139). Form closes as if saved. Alert() for validation (flight-form-dialog.tsx:213). Delete has no confirmation and the label "Clear" for departed/cancelled still hard-deletes (flight-card.tsx:638-646).
- F7 Debug `console.log` left in `handleEditFlight` (page.tsx:104-108) and week-view (:657-661).
- F8 `created_by_id` is NOT NULL with no default in the local test schema (test_schema.sql:175) but `createFlight` never sets it (use-flights.ts:346-361); the generated types mark it optional, implying the live DB has a default. Create may fail on the local stack; the repo test factory must set it. Must verify.
- F9 Creator info is hard-coded: new flights show "USR/User" and `rowToFlight` falls back to "ADM/Admin" (flight-form-dialog.tsx:268-272, use-flights.ts:303-313).
- F10 No realtime/refresh on the board list: only `flight-fuel-status` and the edit-session hook subscribe (grep postgres_changes); `flight` is in the realtime publication (20260704000300:35-45) but `useFlights` has no subscription or refetch interval, so two screens drift.
- F11 Loading/empty/error states are coarse: whole page replaced by "Loading flights..." on every refetch key change (page.tsx:155-161), error via `ErrorMessage` with no retry, empty list text only per column (flight-list.tsx:739).
- F12 Mobile: split grid is `lg:grid-cols-2` (OK); calendar view is mouse-drag only (calendar-week-view.tsx:78-90, 249-273), unusable on touch. Needs a decision (D4).
Dead/duplicate code:
- F13 `app/flight-ops/page.tsx` and `app/flight-operations/day-view/page.tsx` just re-export `app/page.tsx`; `split-view/` and `week-view/` are separate near-copies with their own handlers, no toolbar, no fuel order, no concurrency handling (split-view/page.tsx, week-view/page.tsx). No nav links to any of them (grep found none outside the module).
- F14 `flight-board-ui/` (v0 prototype, own package.json) is unreferenced by the app; only mentioned in `.omc/project-memory.json`.
- F15 Three near-identical `FlightBoard` branches (flight-board.tsx:118-208); `onAddFlight` prop unused there; `any` casts throughout the adapter (types.ts:181-213, use-flights.ts:285-316).
Tooling:
- F16 `pnpm tsc --noEmit` fails with 1 error: `next.config.ts(7,3) 'eslint' does not exist in type 'NextConfig'` (lint/type gates were disabled in commit 56f0525 for Railway). `pnpm lint` is broken (`next lint` removed in Next 16; it treats "lint" as a directory). Biome 1.9.4 is available (`biome.json`).
- F17 Tests not run: vitest/e2e need the local Supabase stack, which is not up (port conflict, see above). Baseline unknown until R1 is resolved.

## Target design
- One board route `/` (D3: keep `/` as canonical; delete `/flight-ops`, `/flight-operations/*` duplicates, or redirect them).
- Pure functions extracted to `components/flight-operations/board-logic.ts` (partition arrivals/departures, filter by search/status/services/dateRange, week range in local time) so they can be vitest-tested without a DOM.
- `useFlights` gets a realtime subscription (pattern: `hooks/use-equipment-realtime.ts`) and surfaces mutation errors via `useToast`.

## Decisions log
- D1 (2026-11-02): No jsdom/RTL; pure-logic vitest + Playwright e2e. Reuses existing patterns.
- D2 (2026-11-02, Ted decided): Model scheduled and actual times. Rename arrival_time/departure_time to scheduled_arrival_time/scheduled_departure_time; add nullable actual_arrival_time/actual_departure_time and is_quick_turn. QT checkbox is preselected between the two scheduled boxes and sets departure = arrival + 1 h; editing departure unchecks QT. Needs a migration (file only; applying to the live shared DB waits for Ted). Staff currently write QT on the board by hand.
- D6 (2026-11-02, Ted): Transient aircraft always have an arrival and a departure (departure may be unknown when entered). Hangared aircraft may have only a departure (pulled from hangar; last arrival possibly days ago) or only an arrival (returning after maintenance, a long trip or a season away). So both scheduled times are nullable with a CHECK that at least one is set. We do not track hangar membership yet and may never hard-constrain it.
- D8 (2026-11-02, Ted): Claude may apply schema changes to the live Supabase for this project via the Supabase CLI (`supabase db push` / migrations), after verifying them against the local stack. Still never touch `fuel_tank_readings`. Live ref `qkuhvlrdidhumyyxokil` is linked (2026-11-02; 146 flight rows). Do not use `db push`: see B01c. Destructive changes (drops, renames) get a backfill-safe migration and are reported in the commit box.
- D9 (2026-11-02, Ted): Add a full Cypress suite for the arrivals/departures module only (B08b-B08e), alongside the existing Playwright pattern; no migration of the other modules. Duplicate coverage with Playwright is accepted; Playwright stays the repo default for other modules.
- D10 (2026-11-02, Ted): Services carry prices, so store them relationally rather than as free-text keys. Today `flight.services` is a jsonb array of strings (no cross-reference table); live data uses keys that match neither the form nor the pills (cleaning 39, lavatory 34, transport 31). Proposed: `service` catalog + `flight_service` junction, optionally linked to `product` (10 rows, SKU + price) for invoicing. See B26.
- D11 (2026-11-02, Ted): Documentation is a first-class module, built and updated simultaneously with each module it documents, cross-linked both ways, shown in a left slide-in panel beside the right-side form sheet (B27, B28). Also 2026-11-02: legacy `django_*` and `auth_*` tables dropped from live (migration 20261102000100, backup kept locally outside the repo).
- D7 (2026-11-02, Ted): Direction of travel: customers (e.g. Greg, N446FM, pulled most mornings 6:00-6:30 with a T/O top-off note) should post pull times and service notes (T/O fuel, TKS fluid) from home. Needs customer accounts and auth: design only, waits for Ted (B24, B25).
- D5 (2026-11-02, Ted): stop ski-jobs Supabase containers for the local test stack (B01); delete flight-board-ui/ and /flight-ops (B21).
- D3 (proposed): canonical route `/`; others redirect.
- D4 (proposed): calendar stays desktop-first; mobile gets split/arrivals/departures lists only.

## Risks / open questions
- R1: Docker already runs another project's Supabase on 54321/54322. Tests cannot run until stopped or fbo ports are moved.
- R2: F1/D2 may need a migration (live data, shared Supabase instance). Never touch `fuel_tank_readings`.
- R3: PR #43 not merged; this work builds on its branch.
- R4: Local test schema may differ from live (F8).
