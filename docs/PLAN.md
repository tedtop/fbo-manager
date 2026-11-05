# PLAN: Arrivals/Departures board (flight-operations)

Goal: Ted can use the board daily, ASAP. Working style: screen-by-screen; finish this screen before the next. Origin: 2026-11-02 (branch `feature/flight-edit-concurrency`, PR #43). Backlog: `BACKLOG.md`.

## Scope (module files)
`frontend/app/page.tsx` (the real board, route `/`), `components/flight-operations/*`, `hooks/use-flights.ts`, `repositories/flights.repo.ts`, tests in `repositories/__tests__/flights.repo.test.ts` and `e2e/`.

## Test tooling (verified)
- vitest 3 (`vitest.config.ts`): `environment: node`, includes only `**/__tests__/**/*.test.ts`, sequential, real local Supabase (no mocks). No jsdom, no @testing-library installed. So "component tests" would need new devDependencies; avoid.
- Cypress e2e (`cypress/e2e/<area>/*.cy.ts`, `cypress.config.ts`, `scripts/test-cypress.ts`; the only browser-test tool since D14): `pnpm test:cypress` starts its own `next dev` on :4210 against local Supabase `127.0.0.1:54321` (browser zone pinned to America/Phoenix); `cy.login()` logs in through the real login form via `cy.session` (dev accounts `admin@minutemanfbo.local` / `user@minutemanfbo.local` seeded by `cypress/tasks/seed.ts`); specs seed rows with service-role tasks (`cypress/tasks/*`, `cypress.config.ts`), use a per-run stamp for unique values, drive the UI and finish with a direct DB read through a `cy.task`. Pattern to copy: `cypress/e2e/flight-operations/flight-edit.cy.ts`.
- Decision D1: board suite = (a) vitest pure-logic tests for the adapter (`types.ts`) and filtering (extracted pure functions), (b) vitest repo tests for flights (extend existing), (c) browser e2e for UI flows (Cypress since D14). No jsdom.
- Environment caveat: Docker currently runs a different project's Supabase stack ("ski-jobs") on ports 54321/54322, so the fbo local stack is not up. e2e/repo tests need `pnpm supabase:stop` there (Ted's call) or a `supabase/config.toml` port change. See risk R1.

## Audit findings (file:line, verified by reading)
Real bugs:
- F1 Every flight lands in BOTH columns. `flight.departure_time` is NOT NULL (test_schema.sql:162) and the form fabricates departure = arrival+45min for arrival-only flights (flight-form-dialog.tsx:242-247), so the adapter always sees both times and sets `type='quick_turn'` (types.ts:164-168), and the board puts quick_turn in both lists (flight-board.tsx:65-79). Arrivals vs departures filtering is effectively broken. Needs a real model decision (D2).
  Status: fixed by B09, B09b, B09c (review). Scheduled/actual times and `is_quick_turn`; QT shows in both columns, others in one.
- F2 Naive timestamps: form builds `${date}T${time}:00` with no timezone (flight-form-dialog.tsx:203-208); fallback departure is computed local then `.toISOString().slice(0,16)` (UTC, no zone) (:246). DB interprets as UTC, UI renders local. Times shift by the UTC offset after reload.
  Status: fixed by B10 (review). Form sends offset ISO instants; bounds are local days converted to UTC.
- F3 `fuel_order_notes` and `location_id` are read by the adapter's input but never mapped to `Flight` (types.ts:191-214) and `fuelOrderNotes` is never sent on update (types.ts:218-290); `en-route` status silently becomes `scheduled` (types.ts:130-131) while the card still offers it (flight-card.tsx:339-359).
  Status: fixed by B14 (review). `fuel_order_notes`/`location_id` round-trip; the en-route status was removed from the card.
- F4 `dateRange` filter (today/tomorrow/week/all) is shown in the toolbar (compact-toolbar.tsx:225) but never applied (flight-board.tsx:32-62; page.tsx:54). `weekInternalFlights` computed and unused (page.tsx:167-180). Split view loads ALL flights unfiltered (page.tsx:44), so the board grows forever.
  Status: fixed by B13 (review). Date range filters by local day; default fetch is bounded; "All Dates" opts in to the unbounded fetch.
- F5 Calendar window fixed at today +-28 days (page.tsx:31-44) regardless of `weekOffset`; navigating past 4 weeks shows an empty calendar. Date strings built via `toISOString().split('T')` (UTC date; wrong near midnight local). `findAllFlights` end bound `${endDate}T23:59:59` has no zone (flights.repo.ts:475). Week-view route computes a different week start (today+offset*7) than the calendar (Sunday start) (week-view/page.tsx:628-640 vs calendar-week-view.tsx:111-113).
  Status: fixed by B10 and B15 (review). The calendar loads the visible week; local-date week bounds are shared in `board-logic.ts`.
- F6 (Original finding) Errors were swallowed: create/update/delete failures only `console.error` (page.tsx:92-123); fuel-order failure same (:136-139). Form closed as if saved. Alert() for validation (flight-form-dialog.tsx:213). (Original text: delete had no confirmation and "Clear" for departed/cancelled hard-deleted; both are now false, see Status.)
  Status: fixed by B11 and B12 (review). Failures show a destructive toast and keep the sheet open; validation is inline. Delete is confirmed in an AlertDialog and is a soft delete (`deleted_at`), not a hard delete.
- F7 Debug `console.log` left in `handleEditFlight` (page.tsx:104-108) and week-view (:657-661).
  Status: fixed by B11 (review). Debug `console.log` removed.
- F8 `created_by_id` is NOT NULL with no default in the local test schema (test_schema.sql:175) but `createFlight` never sets it (use-flights.ts:346-361); the generated types mark it optional, implying the live DB has a default. Create may fail on the local stack; the repo test factory must set it. Must verify.
  Status: worked around locally by migration `20261102000500` (default 1 for `created_by_id`, live parity); the schema parity check is still open under B36.
- F9 Creator info is hard-coded: new flights show "USR/User" and `rowToFlight` falls back to "ADM/Admin" (flight-form-dialog.tsx:268-272, use-flights.ts:303-313).
  Status: still open (B17). Pinned by `KNOWN BUG F9` in `repositories/__tests__/flights.repo.test.ts`.
- F10 No realtime/refresh on the board list: only `flight-fuel-status` and the edit-session hook subscribe (grep postgres_changes); `flight` is in the realtime publication (20260704000300:35-45) but `useFlights` has no subscription or refetch interval, so two screens drift.
  Status: still open (B16).
- F11 Loading/empty/error states are coarse: whole page replaced by "Loading flights..." on every refetch key change (page.tsx:155-161), error via `ErrorMessage` with no retry, empty list text only per column (flight-list.tsx:739).
  Status: fixed by B18 (review). The list keeps previous data while refetching (`keepPreviousData`, inline spinner), the error state has Retry, and empty states name the active filters with a Clear filters action.
- F12 Mobile: split grid is `lg:grid-cols-2` (OK); calendar view is mouse-drag only (calendar-week-view.tsx:78-90, 249-273), unusable on touch. Needs a decision (D4).
  Status: still open (B19; the 390px overflow is tracked as B39 and pinned by `KNOWN BUG M1` in the Cypress mobile spec).
Dead/duplicate code:
- F13 `app/flight-ops/page.tsx` and `app/flight-operations/day-view/page.tsx` just re-export `app/page.tsx`; `split-view/` and `week-view/` are separate near-copies with their own handlers, no toolbar, no fuel order, no concurrency handling (split-view/page.tsx, week-view/page.tsx). No nav links to any of them (grep found none outside the module).
  Status: fixed. `/flight-ops` was removed (commit 0909ced); B20 removed `app/flight-operations/{day-view,split-view,week-view}` (nothing linked to or tested them).
- F14 `flight-board-ui/` (v0 prototype, own package.json) is unreferenced by the app; only mentioned in `.omc/project-memory.json`.
  Status: fixed by B21 (review). Code references removed; the git-ignored `flight-board-ui/` folder is left for Ted to delete.
- F15 Three near-identical `FlightBoard` branches (flight-board.tsx:118-208); `onAddFlight` prop unused there; `any` casts throughout the adapter (types.ts:181-213, use-flights.ts:285-316).
  Status: FlightBoard branches collapsed into one column-driven render path and the unused `onAddFlight` prop removed by B20; the adapter `any` casts remain.
Tooling:
- F16 `pnpm tsc --noEmit` fails with 1 error: `next.config.ts(7,3) 'eslint' does not exist in type 'NextConfig'` (lint/type gates were disabled in commit 56f0525 for Railway). `pnpm lint` is broken (`next lint` removed in Next 16; it treats "lint" as a directory). Biome 1.9.4 is available (`biome.json`).
  Status: fixed by B02 (review). `pnpm tsc --noEmit` is clean and `pnpm lint` runs Biome on the flight-operations files.
- F17 Tests not run: vitest/e2e need the local Supabase stack, which is not up (port conflict, see above). Baseline unknown until R1 is resolved.
  Status: B01 (review) set up the local stack and records the baseline; see STATE.md. Not re-verified here (Docker is down).

## Target design
- One board route `/` (D3: keep `/` as canonical; delete `/flight-ops`, `/flight-operations/*` duplicates, or redirect them).
- Pure functions extracted to `components/flight-operations/board-logic.ts` (partition arrivals/departures, filter by search/status/services/dateRange, week range in local time) so they can be vitest-tested without a DOM.
- `useFlights` gets a realtime subscription (pattern: `hooks/use-equipment-realtime.ts`) and surfaces mutation errors via `useToast`.

## Decisions log
- D1 (2026-11-02): No jsdom/RTL; pure-logic vitest + browser e2e (Cypress since D14). Reuses existing patterns.
- D2 (2026-11-02, Ted decided): Model scheduled and actual times. Rename arrival_time/departure_time to scheduled_arrival_time/scheduled_departure_time; add nullable actual_arrival_time/actual_departure_time and is_quick_turn. QT checkbox is preselected between the two scheduled boxes and sets departure = arrival + 1 h; editing departure unchecks QT. Needs a migration (file only; applying to the live shared DB waits for Ted). Staff currently write QT on the board by hand.
- D6 (2026-11-02, Ted): Transient aircraft always have an arrival and a departure (departure may be unknown when entered). Hangared aircraft may have only a departure (pulled from hangar; last arrival possibly days ago) or only an arrival (returning after maintenance, a long trip or a season away). So both scheduled times are nullable with a CHECK that at least one is set. We do not track hangar membership yet and may never hard-constrain it.
- D8 (2026-11-02, Ted): Claude may apply schema changes to the live Supabase for this project via the Supabase CLI (`supabase db push` / migrations), after verifying them against the local stack. Still never touch `fuel_tank_readings`. Live ref `qkuhvlrdidhumyyxokil` is linked (2026-11-02; 146 flight rows). Do not use `db push`: see B01c. Destructive changes (drops, renames) get a backfill-safe migration and are reported in the commit box.
- D9 (2026-11-02, Ted): Add a full Cypress suite for the arrivals/departures module only (B08b-B08e), alongside the existing second browser runner; no migration of the other modules. Duplicate coverage was accepted; the other runner stayed the repo default for other modules. **Superseded by D14 (2026-11-05).**
- D10 (2026-11-02, Ted): Services carry prices, so store them relationally rather than as free-text keys. Today `flight.services` is a jsonb array of strings (no cross-reference table); live data uses keys that match neither the form nor the pills (cleaning 39, lavatory 34, transport 31). Proposed: `service` catalog + `flight_service` junction, optionally linked to `product` (10 rows, SKU + price) for invoicing. See B26.
- D11 (2026-11-02, Ted): Documentation is a first-class module, built and updated simultaneously with each module it documents, cross-linked both ways, shown in a left slide-in panel beside the right-side form sheet (B27, B28). Also 2026-11-02: legacy `django_*` and `auth_*` tables dropped from live (migration 20261102000100, backup kept locally outside the repo).
- D12 (2026-11-04, Ted asked, rules proposed): Flights can be bulk-added by scanning the front desk's printed schedule (B45). Scan -> free OCR (Tesseract, Cloud Vision fallback) + rule parser -> per-row review -> import through `flights.repo`; nothing is written without the review step. Import never overwrites values already on the board (fill-only updates), so re-scanning the same sheet cannot create duplicates or undo staff edits. Details: "B45 Schedule sheet import design".
- D13 (2026-11-04, Ted): Finished flights leave the board by being **hidden**, not by an age cut-off. A flight set to Departed is hidden from the day after it departed; staff can also hide any flight by hand (Hide button right of Edit). Hidden is a stored flag (`flight.hidden_at`), shown again with a Show hidden filter. Date presets become Today, Today + Future (default), Tomorrow. Resolves B43b. Also: the card's "Order Fuel" button is now "Fuel Request"; Biome clean-up deferred (B48).
- D14 (2026-11-05, Ted): **One browser-test tool: Cypress. Supersedes D9.** The duplicated Playwright suite (`e2e/`, `playwright.config.ts`, the `@playwright/test` dependency, the `pnpm e2e*` scripts and its CI step) is removed; every scenario it covered now lives in `cypress/e2e/<area>/` (flight-operations, equipment, invoicing, settings, api, users, schedule-import), with the Node-side Supabase helpers in `cypress/tasks/`. Vitest stays for unit and repository integration tests. Entry point: `pnpm test:cypress` (own dev server on :4210, `CYPRESS_BASE_URL` for a private port). Why: two runners for the same flows doubled the maintenance and let the two suites drift (D9 had accepted that cost). Docs: `frontend/cypress/README.md`.
- D7 (2026-11-02, Ted): Direction of travel: customers (e.g. Greg, N446FM, pulled most mornings 6:00-6:30 with a T/O top-off note) should post pull times and service notes (T/O fuel, TKS fluid) from home. Needs customer accounts and auth: design only, waits for Ted (B24, B25).
- D5 (2026-11-02, Ted): stop ski-jobs Supabase containers for the local test stack (B01); delete flight-board-ui/ and /flight-ops (B21).
- D3 (proposed): canonical route `/`; others redirect.
- D4 (proposed): calendar stays desktop-first; mobile gets split/arrivals/departures lists only.

## Risks / open questions
- R1: Docker already runs another project's Supabase on 54321/54322. Tests cannot run until stopped or fbo ports are moved.
- R2: F1/D2 may need a migration (live data, shared Supabase instance). Never touch `fuel_tank_readings`.
- R3: PR #43 not merged; this work builds on its branch.
- R4: Local test schema may differ from live (F8).

## B27 Documentation module design
Status: design for review (2026-11-04). No code written. Implements D11. Sub-items B27a-B27d in `BACKLOG.md`; first content outline for B28 at the end.

### 1. Content storage and loading
- **Location**: `frontend/content/docs/<module-id>/<slug>.md`, not `docs/user/`. Reason: `frontend/railway.json` shows the Railway service builds from `frontend/`, so files outside it (like top-level `docs/`) may be missing at build time. Developer docs stay in `docs/`; end-user docs live beside the code that renders them and change in the same PR. One folder per module id; first is `flight-operations/` with `usage-guide.md` (B28).
- **Front matter** (hand-parsed, 15 lines, no `gray-matter`; keys are fixed and validated by the unit test in section 4):
  ```
  ---
  title: Arrivals and Departures usage guide
  module: flight-operations
  order: 1
  anchors: [add-flight, quick-turn, times, hangar-pull, services, status, delete, filters, conflicts]
  ---
  ```
  `anchors` lists the heading ids other code may link to (`?docs=flight-operations#quick-turn`). Heading ids come from `rehype-slug`; a trailing `{#custom-id}` on a heading (as used in the B28 outline) is honored by a ~10-line rehype plugin that runs before `rehype-slug` and strips the suffix, so prose can be reworded without breaking links. The test asserts every declared anchor exists as a heading and every anchor referenced from code (registry `helpAnchors`) is declared.
- **Loading (Next 16 app router)**: `lib/docs/load.ts` (`import 'server-only'`) reads the folder with `node:fs` at build time. Two consumers, both statically generated, no runtime fs:
  1. `app/docs/[module]/page.tsx` (server component, `generateStaticParams` from the registry): the full-page version, linkable and printable, also the no-JS fallback.
  2. `app/api/docs/[module]/route.ts` (`export const dynamic = 'force-static'`, same `generateStaticParams`): returns `{title, anchors, markdown}` JSON, which the panel fetches once per module via the existing react-query client and caches forever (`staleTime: Infinity`). This avoids shipping all Markdown in the layout bundle and avoids routing the panel through a parallel route.
- **Rendering library**: `package.json` has no Markdown renderer (no react-markdown, marked, remark or MDX). Decision: add **`react-markdown` + `remark-gfm` + `rehype-slug`** (3 small ESM deps, no `dangerouslySetInnerHTML`, safe by default, works in client and server components). Rejected: MDX (needs next.config plugin and lets docs run JS, overkill for prose), hand-rolled renderer (tables and lists are the usual docs needs; a bug-prone reimplementation). `@tailwindcss/typography` is not present; style the output with a small `docs-prose` class in `styles/globals.css` using existing tokens instead of adding it. Ted approves new deps (open question 1).
- Images: `public/docs/<module>/*.png`, referenced as `/docs/<module>/x.png`. Optional, not required for B28.

### 2. UI: left slide-in panel beside the right-side form
**Why not just `<Sheet side="left">`.** `components/ui/sheet.tsx` wraps Radix Dialog, which is modal by default and `SheetContent` always renders `SheetOverlay`. When the flight Sheet is open, Radix (a) sets `pointer-events: none` on `body`, (b) traps focus inside the form (`FocusScope`), (c) `aria-hidden`s everything else, and (d) dismisses the form on any outside pointer/focus event. A second modal Sheet therefore either cannot be clicked (if opened before the form) or closes the form (if clicked while the form is open). `modal={false}` on the docs Sheet alone does not fix this, because the form's modal layer still disables outside pointer events for any lower layer and closes on outside click.

**Design.**
- The docs panel is **not a Radix Dialog**. It is a `DocsPanel` client component rendered once in `NavigationWrapper` (inside `<main>`, so it inherits the theme class): `<aside role="complementary" aria-label="Documentation" data-docs-panel>`, `position: fixed`, `inset-y-0 left-0`, `border-r`, slide transition via CSS `translate-x` (`-translate-x-full` to `translate-x-0`, 300 ms; `prefers-reduced-motion` disables). No overlay, no focus trap, no scroll lock, page and form stay interactive. Closed state is `inert` + `aria-hidden` so it is unfocusable offscreen.
- The flight form `Sheet` cooperates through one hook, `useDocs()`: while docs are open, `FlightFormDialog` passes `modal={false}` to `<Sheet>` and a new optional `SheetContent` prop `overlay={false}` (default `true`, so no other sheet changes), plus `onInteractOutside={(e) => { if ((e.target as HTMLElement).closest('[data-docs-panel]')) e.preventDefault() }}` so clicking inside the docs does not close the form. Net effect: with docs open, both are side-by-side non-modal panels; with docs closed the form is modal exactly as today. Flipping `modal` on an open Radix Dialog is supported but must be proven in the B27a spike (risk R5): if it misbehaves, fall back to rendering the form's content in a non-modal custom panel only while docs are open.
- **Keyboard**: Esc inside the docs panel closes only the docs (`onKeyDown` stops propagation); Esc in the form closes only the form. Tab order: form, then docs is reachable because focus is no longer trapped. Docs panel header has a close button (focus returns to the element that opened it, usually the "?" button).
- **Widths / breakpoints**: desktop (`lg` ≥ 1024px): docs `w-[420px]`, form `sm:max-w-md` (448px), the board keeps the remaining space and is not covered when only docs are open (page content gets `lg:pl-[420px]` while docs are open, so the board shifts instead of being hidden). Below `lg` (tablet/mobile 390px): docs `w-full`, `z-[60]` above the form (z-50), with a prominent "Back to form" close button; the form stays mounted underneath, so its input state survives. Between 1024 and ~1100px the board is narrow; acceptable because the form covers the right side anyway.
- **State**: `DocsProvider` (in `providers/docs-provider.tsx`, mounted in `app/layout.tsx` inside `AuthProvider`) holds `{ open, moduleId, anchor }` and exposes `openDocs(moduleId, anchor?)` and `closeDocs()`. **URL is the source of truth**: `?docs=<module>` plus hash `#<anchor>`. Provider reads `useSearchParams()`, and `openDocs` does `router.replace` with `scroll: false`, so:
  - the state is linkable (`/?docs=flight-operations#quick-turn`) and survives reload;
  - it survives client navigation, because the layout (and panel) is not remounted and the param is carried by the provider's `router.replace` when pathname changes only if the user has not closed docs (provider re-appends `?docs=` on `pathname` change). Browser back closes docs naturally. Search params on `/` in use today (filters) must be preserved: `openDocs` merges, never replaces, the existing query.
  - `useSearchParams` requires a `Suspense` boundary in the layout; wrap `DocsProvider`'s reader accordingly.
- **Scroll to anchor**: after the markdown for the module renders (and when the anchor changes), the panel does `container.querySelector('#'+CSS.escape(anchor))?.scrollIntoView({block:'start'})` inside its own scroll container (not the window; the hash is read from the provider, not left to the browser, because the hash would otherwise scroll the board page). The target heading gets a 2 s highlight (`data-highlight` class).
- Nav: add a "Docs" item to `navigation.tsx` that opens the panel at the module index (the module list from the registry) and a `/docs` full-page index route.

### 3. Cross-linking
- **Registry** `lib/docs/registry.ts` (plain data, no `server-only`, importable by client, server and tests):
  ```ts
  export const DOC_MODULES = [
    { id: 'flight-operations', title: 'Arrivals / Departures', route: '/',
      docs: ['usage-guide'], helpAnchors: ['add-flight','quick-turn','times','hangar-pull','services','status','delete','filters','conflicts'] },
    // later: parking, fuel-dispatch, ...
  ] as const
  ```
  `docs` are slugs under `content/docs/<id>/`. Unit test fails when a registered doc file is missing, an anchor is undeclared, or a doc folder exists that is not registered.
- **Module to docs**: a `<HelpButton module="flight-operations" anchor="quick-turn" />` (small ghost "?" icon button, `aria-label="Help: Quick turn"`, calls `openDocs`) used (a) in the board toolbar (opens the guide top), (b) in the flight form header, (c) next to the QT checkbox (anchor `quick-turn`), the scheduled/actual time fields (`times`), and the services pills (`services`). Add `data-testid="help-<anchor>"`.
- **Docs to module**: every doc starts with a line rendered from the registry (not typed in Markdown): an "Open module" link (`Link` to `route`) in the panel header. In Markdown, in-text module links use a custom scheme `module:flight-operations` (mapped by a `components.a` override to the registry route and `closeDocs()` behavior on mobile), and doc-to-doc links use `doc:<module>/<slug>#<anchor>` (resolved to `openDocs`). Plain `http(s)` links open in a new tab with `rel="noopener noreferrer"`. The test validates all `module:` and `doc:` links resolve.

### 4. Keeping docs current (the CLAUDE.md rule)
- Rule (add to `.claude/CLAUDE.md` "Loop settings" bullet already says it; add to `docs/ui-conventions.md` and a PR checklist line): **any PR that changes a module's user-visible behavior updates `frontend/content/docs/<module>/` in the same PR**. The reviewer pass checks the diff for it.
- Lightweight check, vitest only (D1: no jsdom), `lib/docs/docs.test.ts`:
  1. every registry module has a folder, and every listed doc file exists and parses front matter (`title`, `module` equal to folder, `order`, `anchors`);
  2. required headings present: `## Overview`, `## Common tasks`, `## Troubleshooting` (flight-operations additionally `## Fields and rules`); each declared anchor resolves to a heading slug;
  3. every `helpAnchors` entry in the registry is declared in some doc of that module;
  4. all `module:` / `doc:` links resolve; no orphan doc folders;
  5. no doc shorter than a minimum (e.g. 400 chars), which blocks empty stubs.
  Heading slugs use the same `github-slugger` that `rehype-slug` depends on, so test and renderer agree.
- A grep guard (optional, B27d): the test also fails if a `HelpButton` in `components/` uses a module/anchor pair not in the registry (regex scan of source files).

### 5. Test plan
Cypress spec `cypress/e2e/docs/docs.cy.ts` (D14). Flight-form specs need the local stack (B01); the rest do not.
1. Open the board, click toolbar Help: docs panel visible (`getByRole('complementary', {name: 'Documentation'})`), URL contains `?docs=flight-operations`.
2. Open Add Flight, type tail `N123AB` in the form, click the "?" next to QT: both the form dialog and the docs panel are visible at 1280x800; docs scrolled so the `#quick-turn` heading is in the viewport (`toBeInViewport`) and highlighted; the form is still open.
3. With docs open, type in a form field and click a docs link: the form stays open (no outside-dismiss) and typing still works (focus not trapped).
4. Close docs (button and Esc-in-docs): the form is still open and `N123AB` is still in the tail input; the URL param is gone; the board filters param is preserved.
5. Deep link: load `/?docs=flight-operations#times` directly: panel opens and scrolls to `times`.
6. Reload and client navigation (to `/parking` and back): docs state follows the URL as designed; browser back closes docs.
7. "Open module" link from docs navigates to the registry route and keeps or closes docs per viewport.
8. Mobile viewport 390x844: docs open full width above the form, "Back to form" returns, form input intact.
9. Dark/light theme: panel uses theme tokens (screenshot check by Ted, not asserted).
10. Unit (vitest, no DB, runs today): the docs test in section 4, plus `openDocs` URL merge logic extracted to a pure function `buildDocsUrl(searchParams, moduleId, anchor)` and tested (preserves existing params, replaces an existing `docs`).

### 6. Implementation breakdown
- **B27a (S)**: registry, front-matter parser, `load.ts`, `docs.test.ts`, `content/docs/flight-operations/usage-guide.md` stub with required headings and anchors; add the three dependencies; `app/docs/[module]/page.tsx` + `/docs` index (full-page rendering proves the pipeline). No panel yet.
- **B27b (M)**: `DocsProvider` + `buildDocsUrl`, static JSON route, `DocsPanel` (non-Radix aside, widths, mobile, scroll-to-anchor, highlight, link scheme overrides), nav "Docs" item, `docs-prose` styles. Includes the spike for risk R5.
- **B27c (S)**: `SheetContent` `overlay` prop, `FlightFormDialog` cooperation (modal flip, outside-interact guard), `HelpButton` placed in toolbar, form header, QT, times and services; `ui-conventions.md` section "Docs panel" and the same-PR rule.
- **B27d (S)**: Cypress specs from section 5, README test notes; verify on the local stack once B01 is up.
B27 itself is "design done" (review). B28 (content) can start after B27a lands, and finishes after B09-B09c.

### 7. B28 outline: Arrivals/Departures usage guide (headings only; reflects current behavior)
`flight-operations/usage-guide.md`
- `## Overview` (what the board shows: arrivals, departures, Today default, views)
- `## Common tasks`
  - `### Add a flight` {#add-flight} (tail, type, FBO, required fields; transient vs hangared)
  - `### Quick turn (QT) and the +1 hour rule` {#quick-turn} (QT preselected on new flights; departure = arrival + 1 h; editing departure by hand unchecks QT)
  - `### Scheduled vs actual times` {#times} (scheduled arrival/departure vs actual; when to fill actuals; local time)
  - `### Arrival-only and departure-only entries (hangar pull)` {#hangar-pull} (hangared aircraft may have only a departure (pull) or only an arrival (return); at least one scheduled time is required; notes such as T/O fuel)
  - `### Services` {#services} (pills, what the form offers; note B26 may change the catalog)
  - `### Change a flight's status` {#status} (statuses available today; en route does not exist)
  - `### Delete a flight` {#delete} (single Delete action, confirmation names the tail)
  - `### Filters, search, views and the date filter` {#filters} (search, status, services; split / arrivals / departures / calendar; date filter default Today, local days; "All Dates" opt-in)
  - `### Editing conflicts` {#conflicts} (what the conflict dialog means when another user saved first; reload vs overwrite)
- `## Fields and rules` (field table: tail, schedule fields, QT, fuel order notes, location)
- `## Troubleshooting` (flight not visible: date filter; save failed toast; conflict dialog; QT unchecked unexpectedly)
Wording is verified against the running board before B28 is closed.

### 8. Open questions for Ted
1. OK to add `react-markdown`, `remark-gfm`, `rehype-slug` (no MDX, no typography plugin)?
2. Docs stored in `frontend/content/docs/` (build-safe for Railway) rather than `docs/user/`: OK?
3. Docs panel not built on Radix (custom aside) so it can sit beside the modal-by-default form: OK, or do you prefer making every Sheet non-modal?
4. Should the docs be visible to every logged-in role, or hidden for some (users, training)? Default: all roles, and no auth needed for `/docs`.
5. Mobile: full-width docs on top of the form (proposed), or hide the Help buttons on mobile?
6. Should a visible "Docs" nav entry exist, or only per-module Help buttons?

## B26 Service catalog design

Status: design only (2026-11-04). No migration or app code written. Implements D10. Live facts below came from read-only `select` queries against project `qkuhvlrdidhumyyxokil`.

### 1. Live data audit (read-only, 2026-11-04)

- `flight.services` is a **jsonb array of plain strings** on all 146 rows (every row is a jsonb array; no objects, no nulls). No duplicate key inside any one flight.
- **146 flights**, of which **6 are soft-deleted** (`deleted_at` set). **101 flights have at least one service.** Total **service rows = 255** (242 on non-deleted flights). **This differs from the 308 in the backlog/plan**: sample data was purged or edited since that count. The B26 gate must therefore be "junction count equals the jsonb element count measured in the migration itself", never a hard-coded number.
- Distinct keys and counts (count equals flights, since no dupes): catering 50, fuel 49, cleaning 39, lavatory 34, transport 31, hangar 8, gpu 6, dishes 6, courtesy_car 5, oxygen 5, passengers 5, coffee 5, ice 5, lav 5, rental_car 2. 15 distinct keys, summing to 255.
- Not one of the 12 card pill keys (fuel, hangar, catering, gpu, lav, oxygen, courtesy_car, rental_car, passengers, coffee, ice, dishes): **cleaning (39), lavatory (34), transport (31)**. The form's 5-item list also offers `maintenance` and `ground_transport`: **neither occurs live (0 rows)**, but the form can write them, so the catalog must include them or the form regresses.
- `lav` (5) and `lavatory` (34) coexist: the Lav pill only shows for the 5; the `lavatory` rows are invisible on cards (the card does `if (!service) return null`). Same for cleaning and transport: 104 of 255 rows (41%) render nowhere today.

Proposed mapping (legacy key -> catalog key):

| Legacy key | Catalog key | Note |
|---|---|---|
| lavatory | lav | merge; 39 total after backfill |
| transport | ground_transport | merge; label "Ground Transport" |
| cleaning | cleaning | NEW catalog row (no pill today); needs icon/color |
| maintenance | maintenance | NEW catalog row (0 live rows, form offers it) |
| ground_transport | ground_transport | identity (0 live rows) |
| the 12 pill keys | same | identity |

Catalog = 12 pill keys + cleaning + maintenance + ground_transport = **15 rows**. Open question 1 asks Ted to confirm the merges.

### 2. Schema

`flight.id` and `product.id` are **bigint** live (older migration files say integer; live is truth, re-check `information_schema` before writing the file).

```sql
-- Touches: service (new), flight_service (new). Reads flight, product. Never touches fuel_tank_readings.
create table service (
  id            bigint generated always as identity primary key,
  key           text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  label         text not null,
  icon          text not null,                 -- lucide icon name, resolved client-side via a static map
  color         text not null,                 -- semantic token (e.g. 'blue'), NOT a tailwind class string
  default_price numeric(10,2) check (default_price is null or default_price >= 0),
  product_id    bigint references product(id) on delete set null,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index service_active_sort_idx on service (active, sort_order);
create index service_product_id_idx on service (product_id) where product_id is not null;

create table flight_service (
  id             bigint generated always as identity primary key,
  flight_id      bigint not null references flight(id) on delete cascade,
  service_id     bigint not null references service(id) on delete restrict,
  quantity       integer not null default 1 check (quantity > 0),
  notes          text not null default '',
  price_override numeric(10,2) check (price_override is null or price_override >= 0),
  created_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (flight_id, service_id)
);
create index flight_service_service_id_idx on flight_service (service_id);  -- flight_id covered by the unique index
```

Decisions:
- **flight_id ON DELETE CASCADE**: flights are soft-deleted (`deleted_at`, migration 20261102000000), so a hard delete is rare admin cleanup and orphan junction rows would be meaningless. The soft-delete path never fires the cascade.
- **service_id ON DELETE RESTRICT**: a catalog row in use cannot be dropped; retire it with `active = false` (old flights keep showing it, the picker hides it).
- `color` is a semantic token mapped to the existing tailwind classes in one client map (tailwind's scanner cannot see runtime class strings). `icon` likewise maps a name to a lucide component. Both maps live in `components/flight-operations/service-visuals.ts`.
- Every NOT NULL timestamp has an explicit `default now()` (B01c lesson: live Django-era columns lacked defaults and inserts broke). Wire the generic `set_updated_at()` trigger (20260703000300) on both tables.
- Add both tables to `types/database.ts` (hand-edit like the existing entries, or regenerate).
- **RLS** (consistent with docs/rls-rollout-plan.md: anon denied, authenticated allowed): `enable row level security` on both; policies `to authenticated` allowing select/insert/update/delete on `flight_service`; select for authenticated on `service`, with writes to `service` also authenticated for now and tightened to the Phase 2 module-access helper in B30. Explicit `revoke all ... from anon`, grants to authenticated (select/insert/update/delete) and service_role.
- Seed `service` in the same migration (15 rows, `sort_order` following the current pill order). `default_price` and `product_id` stay NULL in the seed (section 5).

### 3. Migration plan (B01c procedure)

Two files, applied one at a time, never `db push`:

1. `<ts>_service_catalog.sql`: tables, seed, RLS, triggers, RPC, backfill, all in one transaction.
2. (B26e, later) `<ts>_drop_flight_services.sql`: drop `flight.services`.

Steps:
1. Verify locally first (`supabase db reset`, then repo tests). This design was written without a local DB.
2. Backup: `select id, services from flight` into `docs/archive/flight-services-backup-<date>.json` before apply.
3. Capture pre-counts in the script: `sum(jsonb_array_length(services))` (255 on 2026-11-04) and flights with services (101).
4. Apply: `cd frontend && supabase db query --linked -f supabase/migrations/<file>.sql`, then `supabase migration repair --status applied <version>`.
5. Backfill (inside the transaction), failing on unknown keys:

```sql
create temporary table _svc_map (legacy text primary key, key text not null) on commit drop;
insert into _svc_map values ('lavatory','lav'),('transport','ground_transport');
-- every other key maps to itself via service.key

do $$
declare unknown text;
begin
  select string_agg(distinct e.k, ', ') into unknown
  from (select jsonb_array_elements_text(services) k from flight) e
  left join _svc_map m on m.legacy = e.k
  left join service s on s.key = coalesce(m.key, e.k)
  where s.id is null;
  if unknown is not null then
    raise exception 'flight.services has keys with no catalog row: %', unknown;  -- aborts and rolls back
  end if;
end $$;

insert into flight_service (flight_id, service_id)
select distinct f.id, s.id          -- distinct: lav + lavatory on one flight collapse to one row
from flight f
cross join lateral jsonb_array_elements_text(f.services) e(k)
left join _svc_map m on m.legacy = e.k
join service s on s.key = coalesce(m.key, e.k);
```

6. Checks (also in the transaction, raising on mismatch): `count(*)` of `flight_service` equals the count of distinct (flight, mapped key) pairs derived from the jsonb. Report any collapse (a flight holding both `lav` and `lavatory`, or `transport` and `ground_transport`); live has 0 raw duplicates, so run a co-occurrence query in B26a first (expected delta 0 to a few). Flights stay 146, flights with services stay 101. Record the numbers in the commit box.
7. `flight.services` stays in place and is **read-only by convention**: after B26b the app stops writing it. B26d compares mapped `flight.services` against the junction before the drop migration.
8. Rollback before B26e: `drop table flight_service; drop table service;` plus drop the RPC (`flight.services` was never modified). After B26e: restore the column (`jsonb not null default '[]'`) and repopulate from the backup JSON; hence B26e runs only after Ted signs off.

### 4. App changes

- **Shared picker**: `components/flight-operations/service-pill-picker.tsx` (`{ value: string[] keys, onChange, services, variant }`) plus `ServicePill` for display. Used by `flight-card.tsx` (replaces `serviceConfig`, `availableServices` and the toggle UI) and `flight-form-dialog.tsx` (replaces the 5-item checkbox list and `service.replace('_',' ')`). The form fly-out then shows exactly the card's pills, and the 41% of rows invisible today become visible.
- **Catalog hook**: `hooks/use-services.ts`, react-query key `['services']`, `staleTime` 5 min, backed by `repositories/services.repo.ts` (`findActiveServices`, `findAllServices`). Sorted by `sort_order`. The card needs inactive rows too (a retired service on an old flight still renders), so the hook fetches all rows and the picker filters on `active`. Loading state: skeleton pills.
- **Reads (board query shape)**: extend `FLIGHT_SELECT` with `flight_services:flight_service ( service_id, quantity, notes, price_override, service:service_id ( key ) )` and map to `flight.services: string[]` of **keys** in `rowToFlight`, so `types.ts`, `board-logic.ts` (`flight.services.includes`) and all components keep their current `string[]` contract. Perf: one extra PostgREST embed, served by the unique index on `(flight_id, service_id)`; ~255 rows total, negligible, still one round trip, list window stays bounded as today. Labels and icons come from the cached catalog, not per-row joins.
- **Writes: Postgres RPC** `set_flight_services(p_flight_id bigint, p_keys text[], p_expected_updated_at timestamptz)`, `security invoker` (RLS applies). In one transaction it locks the flight row, raises a conflict when `p_expected_updated_at` is given and differs from `flight.updated_at`, raises on unknown keys, deletes junction rows no longer selected, inserts new ones (retained rows keep quantity/notes/price_override), then bumps `flight.updated_at` (via `update flight set id = id where id = p_flight_id` so the existing trigger fires). Why an RPC rather than a client-side repository function: PostgREST has no multi-statement transaction, so client delete-then-insert can leave partial services after a dropped connection, and two clients can interleave; and a bare junction write would bypass the form's `updated_at` edit-concurrency check because it never touches `flight`. Create is two steps (insert flight, then the RPC); the RPC is idempotent so Save can retry (open question 4 offers a single `create_flight_with_services` RPC instead). Execute granted to authenticated only.
- **Toolbar filter**: `compact-toolbar.tsx` `serviceOptions` (5 hard-coded) comes from `useServices()` (active rows). `board-logic.ts` is unchanged because `flight.services` stays a key array. This also fixes the filter today being unable to select lav, gpu, oxygen, etc.
- **Realtime/polling (B16)**: B16 subscribes to `postgres_changes` on `flight`. Edits through the RPC bump `flight.updated_at`, so that one subscription already fires and invalidates `flightKeys.all`; no second channel is required. Direct junction writes (admin SQL) would only show on the next refetch; optionally also subscribe to `flight_service` in B26c (cheap).
- **Plumbing**: `types.ts` keeps `services: string[]`. `componentFlightToApiRequest` stops feeding `services` into `flight` updates; `use-flights.ts` drops `dbUpdates.services` / the create `services` field and calls the RPC with the picked keys (resolved to ids inside the RPC, so the client never handles ids).
- **Card inline editing** (`localServices`, `isEditingServices`): behavior unchanged, choices from the shared picker, saved through the same mutation path.

### 5. Pricing

- D10 says services carry prices. Stance: the **catalog stores a suggested price, the junction stores an override, invoicing stays the source of money truth.**
- Effective suggested price: `coalesce(price_override, service.default_price, product.price)` (resolved in a view or client function; never copied into invoice rows at flight time).
- `service.product_id` links to `product` (10 live rows: PARK-JET 150, PARK-SGL 25, SVC-GPU 75, SVC-LAV 125, SVC-H2O 45, SVC-DEICE 250, FEE-CATER 50, FEE-RAMP 75, PROD-PRIST 15, PROD-OIL 12.50). Natural pairs: gpu to SVC-GPU, lav to SVC-LAV, catering to FEE-CATER. The migration does **not** populate links or prices (Ted's call, open question 2).
- Invoicing: `invoice_line_items.product_id` and `invoices.flight_id` already exist, so a later item can offer "add this flight's services as invoice lines" at the effective price.
- **Out of scope for B26**: invoice generation from services, any price-editing UI, tax, per-customer pricing, changes to `product` or invoice tables, admin CRUD UI for the catalog (SQL until a later item), per-service permissions, fuel orders (stay on `flight.fuel_order_notes`; `fuel` is just a pill), `quantity`/`notes` inputs in the UI (columns exist, UI writes the defaults 1 and ''), and anything touching `fuel_tank_readings`.

### 6. Test plan

- **Repository/RPC tests** (vitest, local DB): `services.repo` (active sorted; inactive hidden from the picker query); flights repo embed returns `flight_services` and maps to keys; RPC: add/remove, idempotent re-set, unknown key raises, stale `p_expected_updated_at` raises conflict, junction change bumps `flight.updated_at`, cascade on hard flight delete, restrict on catalog delete, UNIQUE(flight_id, service_id).
- **Migration test**: seed a legacy-shaped `flight.services` (with `lavatory`, `transport`, `cleaning`, plus an unknown key) and assert correct mapping, duplicate collapse, and that the unknown key **raises** with the transaction rolled back.
- **Adapter/unit tests**: `rowToFlight` embed to `string[]`; `componentFlightToApiRequest` no longer emits `services`; `board-logic` services filter on keys; picker component (renders catalog pills, toggles, a retired service on a flight still renders).
- **Cypress**: in the form pick Fuel, Lav and Cleaning, save, assert the same three pills on the card; reopen the form and see them preselected; remove one and verify on the card; toolbar service filter lists catalog items and filters.
- Same Cypress spec: plus a backfilled legacy flight (`lavatory`) showing the Lav pill.
- **Live check** (read-only) after apply: counts per section 3 step 6.

### 7. Breakdown

| Item | Scope | Size |
|---|---|---|
| B26a | Migration: tables, seed, RLS, triggers, backfill (fails on unknown), `set_flight_services` RPC; local verify, backup, live apply via B01c, `types/database.ts`, migration test | M |
| B26b | `services.repo`, `use-services`, flight select embed, `rowToFlight`, create/update write via RPC, repo and RPC tests | M |
| B26c | Shared `ServicePillPicker`/`ServicePill` + `service-visuals`; wire card and form fly-out; toolbar filter from catalog; component tests | M |
| B26d | Cypress specs, live parity check | S |
| B26e | After Ted's sign-off: drop `flight.services` (backup, B01c apply, rollback documented), remove jsonb plumbing | S |

Order a, b, c, d, e. B26a needs Docker back for local verification.

### 8. Open questions for Ted

1. Legacy mapping: OK to merge `lavatory` into `lav` and `transport` into `ground_transport` (or is `transport` really Courtesy Car)? Add `cleaning`, `maintenance`, `ground_transport` as new pills?
2. Do services carry prices now (D10)? If yes, give prices or confirm linking gpu/lav/catering to existing `product` rows; otherwise `default_price` stays NULL.
3. Does `quantity` matter (2 GPU starts, bags of ice) and should the form expose quantity and per-service notes, or stay simple toggles?
4. Is "create flight, then set services" (two calls) acceptable, or a single atomic `create_flight_with_services` RPC?
5. Should retired services keep showing on old flights (proposed) or vanish everywhere?
6. Is catalog editing in the UI wanted soon, or is SQL-only fine for now?

### B26 addendum: billable items vs board services (Ted, 2026-11-04)

Requirement: there must be billable items that never appear on the arrivals/departures board (example: the ramp fee, billed by the front desk). The board only shows operational services (fuel, catering, GPU, ...). So "can be billed" and "shown on the board" are two independent properties.

Finding: `product` already exists and has `product_type` ('fuel' | 'service' | 'fee' | 'product') plus SKU and price (10 rows live). It is the natural billing catalog; a ramp fee is a `product` of type `fee`.

Proposed shape (supersedes sections 2 and 5 where they conflict):
- `product` stays the single source of truth for anything billable and for prices.
- `service` is the board vocabulary only (key, label, icon, color, sort_order, active, plus nullable `product_id`). A service may point at a product when it is billable (fuel, GPU, lav, catering); a service with no product is board-only (e.g. a courtesy note). `service.default_price` is dropped: price comes from the linked product.
- Billable items with no board presence (ramp fee, parking, handling fees) are simply `product` rows with no `service` row. They never reach the board and the flight form never lists them.
- `flight_service` stays as designed (which board services a flight has, quantity, notes) and may carry a `price_override`; invoicing resolves price as `coalesce(price_override, product.price)`.
- How front-desk charges attach to an aircraft visit (invoice line items referencing the flight, or standalone) is an invoicing question and is out of scope for B26; the schema above leaves it open because invoice lines already reference `flight_id` (invoices.flight_id) and `product`.

Open questions added: (a) Which items does the front desk bill that are not board services (ramp fee, parking, hangar, handling, ...)? (b) Should some board services never be billed (courtesy note, passenger count), or does every pill map to a product? (c) Is the ramp fee per visit, per night or by aircraft weight (affects whether it is a flat `product` price or a rule)?

### B26 build plan, revised 2026-11-04 (supersedes the build breakdown above where they conflict)

Decisions (Ted, 2026-11-04): build the service catalog now; billable-but-not-on-the-board items must be possible (ramp fee); the add/edit form is being finalized in a separate session, so services must plug into it through a stable seam rather than by editing the form first.

1. **Legacy data is moot.** The live `flight` table was purged on 2026-11-04 (0 rows), so the legacy-key backfill (lavatory/transport/cleaning mapping) has nothing to migrate. B26a creates and seeds the catalog and the junction; the `flight.services` backfill step is a guarded no-op that still raises on unknown keys if any rows exist, so the script stays safe if it is ever re-run against populated data. The legacy-key mapping questions stand only as seed-catalog decisions (which pills exist).
2. **Billing vs board** follows the addendum above: `product` is the billing catalog; `service` is board vocabulary with a nullable `product_id`; billable items with no board presence are `product` rows only. `service.default_price` is dropped (price comes from the linked product); `flight_service.price_override` stays.
3. **Seed catalog** (board pills): the 12 card pills plus cleaning, maintenance, ground_transport (15 rows). Linking pills to `product` rows is left NULL until Ted maps them (open question 2 in the earlier list), so nothing is invoiced differently yet.
4. **Seam with the form session** (the add/edit form is owned by another session; do not edit `flight-form-dialog.tsx` or `flight-time.ts` from this work):
   - B26a/B26b are invisible to the form: schema, repository, hook and RPC only. Until B26c lands the form keeps writing `flight.services` (jsonb), and B26b keeps writing both places (jsonb + junction through the RPC) so nothing breaks.
   - B26c delivers a self-contained component `components/flight-operations/service-pill-picker.tsx` with the contract `ServicePillPicker({ value: string[], onChange(keys: string[]), disabled? })` (keys are `service.key`; it reads the catalog itself via `use-services`). The form session replaces its hard-coded services list with that one component; the card uses the same component read-only (`ServicePill`). The form session must not add new hard-coded service lists.
   - Form payload stays `services: string[]` (keys). The adapter in `types.ts` is the only place that maps keys to junction rows (through the RPC).
5. **Sequence:** B26a (migration + RPC, local only) -> B26b (repo/hook/RPC write, dual-write) -> hand off the picker contract to the form session -> B26c (picker, card, toolbar) -> B26d (tests, live parity) -> B26e (drop jsonb after sign-off). Live apply of any B26 migration waits for Ted's go-ahead (B01c procedure, backup first, `--yes` confirmation).

### B26a as built (2026-11-04, local only) - deviations from the design above

- `set_flight_services(p_flight_id bigint, p_services jsonb) returns text[]`: takes key strings and/or `{key, quantity?, notes?, price_override?}` objects; **no `p_expected_updated_at` parameter** (the form's concurrency check stays in the app via `flight.updated_at`, which the RPC bumps). A plain key string keeps an existing row's quantity/notes/price_override; duplicate keys in the input collapse (last wins).
- Inactive keys: raise only when the key is not already on that flight, so a retired service never blocks editing an old flight (PLAN open question 5, "retired services keep showing").
- `flight_service.notes` is `text not null default ''` (as in the earlier design); `service.product_id` is `on delete set null`; no `default_price` column.
- Local vs live drift handled in the migration: local `flight.services` is `text[] not null` and `flight.id`/`product.id` are `integer`, live is `jsonb` / `bigint`. Junction FKs are bigint (valid against integer keys); the legacy column is only touched via `to_jsonb()` and `jsonb_populate_record()`, so one file works on both.
- Backfill runs between `-- BACKFILL:BEGIN/END` markers (the repo test executes that block against scratch rows in a rolled-back transaction). Re-run safe: on an empty junction it requires count == distinct (flight, mapped key) pairs; on a populated one it requires no missing pair.
- `tests/support/reset.ts` wipes `flight_service` but deliberately keeps the seeded `service` catalog; tests that change the catalog restore it.
- Local apply note: `supabase migration up` against the local DB needs `--yes` here (agent mode) and would also apply the other session's pending `20261104000000_equipment_sort_order.sql`; B26a was applied with `psql -f` and recorded in the local `supabase_migrations.schema_migrations`.

### B26b/c as built (2026-11-04, local only)

Decisions (Ted, 2026-11-04): retired/inactive services do not need to stay on flights, so `set_flight_services` now raises on ANY inactive or unknown key (the "unless the flight already has it" exception from B26a is gone; migration 20261104000200 edited in place, not applied to live; function re-applied locally with psql). Legacy data is moot. Billable-but-not-on-board items live in `product` and are never in the picker. Pills come only from the `service` catalog.

- **Reads:** `FLIGHT_SELECT` embeds `flight_service ( service:service_id ( key, sort_order ) )`; `serviceKeysFromRow()` (flights.repo.ts) maps it to the `services: string[]` key array in catalog order, so `types.ts` and `board-logic.ts` keep their contract. The junction is the single source; `rowToFlight` no longer reads `flight.services`. (The form's edit-session "reload" path still reads the raw `flight.services` column, which the RPC keeps in sync until B26e.)
- **Writes:** create inserts the flight with `services: []`, then calls `set_flight_services` (skipped when no services picked). Update no longer sends `services` in the flight update; after the guarded (`expectedUpdatedAt`) update succeeds it calls the RPC. In both cases the flight is re-read afterwards so the returned flight carries the post-RPC `updated_at` (the RPC bumps it); the next edit therefore compares against the right value. If the RPC fails after the insert/update, the error toast reads "Flight created|updated, but its services were not saved: ..." and the board refreshes (`onSettled`). A services-only update sends a no-op `updated_at` write so the compare-and-swap still applies.
- **Realtime:** unchanged. The RPC updates `flight` (updated_at and the legacy column), so the existing `flight` subscription fires.
- **Catalog:** `repositories/services.repo.ts` (`findActiveServices`, `setFlightServices`), `hooks/use-services.ts` (key `['services','active']`, staleTime 5 min). Only active rows are fetched.
- **UI:** `components/flight-operations/service-visuals.ts` (icon name and colour token to lucide icon and Tailwind classes, per-key defaults for the seeded keys, generic `Tag` pill for unknown), `service-pill-picker.tsx`. Card and form fly-out use the picker; the card's read-only pills use `ServicePill`; the toolbar "Required Services" filter is `useServices()`.
- **Picker contract:** `ServicePillPicker({ value: string[], onChange(keys: string[]), disabled?, className? })`; keys are `service.key`; reads the catalog itself; buttons `type="button"`, `aria-pressed`, accessible name = label, `data-service-key` for test selectors. A key in `value` that is not in the active catalog (retired) is shown as a selected generic pill so it can be removed (saving it would be refused by the RPC). `ServicePill({ serviceKey, className? })` is the read-only pill. Pure `ServicePillPickerView` / `ServicePillView` take the catalog explicitly (used by tests).
- **Tests:** `services.repo.test.ts` (repo, embed, dual write, post-RPC updated_at compare-and-swap), `service-visuals.test.ts`, `service-pill-picker.test.ts` (react-dom/server markup), `service-catalog.repo.test.ts` updated for the inactive-key rule. Existing Cypress service selectors changed from checkbox (`#hangar`) to the pills (`button` named "Hangar" / `button[data-service-key="hangar"]`); not run here (B26d).

## B45 Schedule sheet import design

Status (2026-11-05): B45a, B45b and B45c are built and in review. Pure rules (mapping, leg pairing, duplicates, review state) are unit-tested against an inline fixture of the real sample (`docs/samples/schedule-sheet-2026-11-04.jpg`); the upload and review screen is `/flight-operations/import` (button on the board toolbar); one Cypress spec stubs the OCR and registry-lookup routes. **Extraction changed the same day (Ted's decision, the Anthropic account has no credit and API credit must never be spent on this project): the route no longer calls Claude by default. It runs free OCR and a rule-based parser, see "Extraction engines (free OCR)" below.** The real photo parses to all six rows through the real route. Implements D12.

### Extraction engines (free OCR)

`POST /api/ocr/schedule-sheet` returns the same `ExtractedScheduleSheet` as before (review screen unchanged). Engine order, in `lib/schedule-import/extract-sheet.ts` (pure, engines injected, unit-tested with mocks):

1. **Tesseract** (`ocr-tesseract.ts`, `tesseract.js` 5.1.1, server side, one shared worker per process). `eng.traineddata` is bundled in `frontend/ocr-data/` and passed as `langPath`/`cachePath` with `gzip:false`, so nothing is downloaded at runtime (override the folder with `OCR_DATA_DIR`). The image is first cleaned with `sharp` (`preprocess.ts`: EXIF auto-rotate, grayscale, normalize, upscale to at least 2000 px wide, cap 3200). When the first read is poor (no rows, more than a third of rows doubtful, or page confidence under 55) it is retried at 90/180/270 degrees and then at plus/minus 3 and 6 degrees from the best orientation, stopping at the first good read; a page that is merely another format is not retried.
2. **Parser** (`parse-total-fbo.ts`, pure): turns the OCR text of the Total FBO "Scheduled Arrivals and Requests" report into `ExtractedScheduleRow[]`: `sheet_date` from `Run:`, range from `For The Period: A Through: B`, one leg per line that starts with `date time action` (Arrive fills arrival_*, Depart fills departure_*, 24 h `HH:mm`), `Service Duration - ...` to notes (plus `Confirmed <date>` when the Confirmed column was read), `Services Required:` sub-lines to services. It is fuzzy: `Arive`, `10:00AM` with no space, O/l for 0/1, a date with one wrong digit is repaired only when exactly one single-digit fix lands inside the printed period (`41/26/2026` -> `11/26/2026`, row flagged), clipped customers are snapped to the desk's known names, garbage lines and trailing junk are dropped. It never invents a row (a row exists only where a line starts with a date and a time) and never guesses a tail: a tail that is not a valid registration shape (`N5S5HM`) sets `needs_review`, as do a repaired or out-of-period date, an unreadable action, or a time with no AM/PM. Cosmetic repairs only lower `confidence` to medium. Real Tesseract output of the sample photo is the vitest fixture `lib/schedule-import/__tests__/total-fbo-photo.txt`.
3. **Google Cloud Vision** (`ocr-vision.ts`, REST `images:annotate`, `DOCUMENT_TEXT_DETECTION`, key sent in the `x-goog-api-key` header). Used only when `GOOGLE_VISION_API_KEY` is set AND Tesseract's parse found zero rows, or average confidence is under 60, or more than a third of rows are `needs_review`; the better parse (more rows, fewer doubtful) wins. Without the key it is skipped and a single warning is logged. About 1,000 free units a month, far above the real volume. **Ted must create the key (not available yet).**
4. **Claude vision** (the old prompt, kept in the route) is a last resort: only when `SCHEDULE_OCR_ALLOW_CLAUDE=1` and `ANTHROPIC_API_KEY` is set, and only for a sheet whose format the parser does not recognise (no "Scheduled Arrivals and Requests" title / Action column). Default off.

Errors: 400 no file / not an image / PDF (`PDF is not supported here`: the route reads photos only; the upload screen turns PDFs into page JPEGs in the browser first, see "PDF scans" below), 422 `Unrecognised sheet format` with the OCR `raw_text` when no engine recognises the sheet, 500 `Text recognition failed` when Tesseract itself crashes and nothing else can read it, 502 only from the Claude path. Env vars: `GOOGLE_VISION_API_KEY`, `SCHEDULE_OCR_ALLOW_CLAUDE`, `OCR_DATA_DIR`, plus the old `ANTHROPIC_API_KEY` / `SCHEDULE_OCR_MODEL` for the Claude path (all in `.env.example`).

Measured on the real photo (MacBook, warm worker): 6/6 rows, about 2.7 s through the production build; the photo rotated 90 degrees: 6/6 in about 12 s; 180 degrees 6/6. A hand tilt of 3 to 8 degrees is the weak spot: Tesseract then sometimes drops a row silently (a 3 degree copy lost one of six; 6 to 8 degrees mangled customers and tails) because a lost row cannot be told from a row that was never there. Hold the camera square; check the row count against the paper; with a Vision key the fallback triggers on the doubtful ones, but a silently lost row still needs the user's eye. A projection-profile deskew was tried and removed: it made the sample worse.

Deploy: Railway runs `pnpm build` + `pnpm start` (`next start`), which has the full `node_modules` and the repo's `ocr-data/`, and was verified that way. `next.config.ts` marks `tesseract.js`, `tesseract.js-core` and `sharp` as `serverExternalPackages` and lists `ocr-data` in `outputFileTracingIncludes`. The **standalone** output (used only by the alternative `Dockerfile.prod`) does NOT work yet: Next traces only part of tesseract.js (`require('..')` from its worker script is missing, and `tesseract.js-core` plus the small deps are not copied) and a `node_modules/**` include glob cannot be used because this checkout has a `node_modules/node_modules` symlink that sends Turbopack's trace into an infinite loop. Fixing it means copying `node_modules/.pnpm/tesseract.js*` and its dependencies in `Dockerfile.prod`.

What the real sample showed (Minuteman "Scheduled Arrivals and Requests", period 11/04 to 11/30/2026): columns Date | Time | Action (Arrive/Depart) | Aircraft (tail) | Type | Customer Name | Confirmed; every printed row is ONE LEG with its own date and a 12 h AM/PM time; sub-lines "Service Duration - Short Stay" and "Services Required:" (sometimes followed by lines such as "Rental Car - Passenger: Sadler"). The Type column is unreliable free text from the desk software (CJ2, ENCORE, BRAVO, G-IVSP), see section 3. Six printed rows become four flights.

### 1. Data flow

```
printout (photo / scan / PDF, one or more files)
  -> POST /api/ocr/schedule-sheet            (FormData, repeated `file` photos; Tesseract -> parse-total-fbo, Cloud Vision fallback, Claude only if SCHEDULE_OCR_ALLOW_CLAUDE=1; see "Extraction engines (free OCR)")
  -> ExtractedScheduleSheet                  (lib/schedule-import/normalize.ts cleans the model JSON; multi-file merged, row.page = file number)
  -> pairSingleLegRows(rows)                 pure; merges an Arrive row with the Depart row of the same tail (section 3a)
  -> mapExtractedRowToFlightDraft(row, { sheetDate, timeZone })      per (merged) row, pure
  -> ScheduleFlightDraft[]                   (ISO with offset, QT, direction, services keys, needsReview + reasons)
  -> findDuplicateFlight(draft, existing, { windowMinutes })         per row, pure; existing = flights.repo findAllFlights over the sheet's date span
  -> tail -> aircraft type lookup            /api/aircraft/lookup (adsbdb), one cached query per tail; user can override
  -> review screen (B45b)                    user edits, picks add / update / skip per row
  -> flights.repo createFlight / updateFlight (aircraft find-or-create first); original scan stored with scanned-documents.repo
```

Files: `app/api/ocr/schedule-sheet/route.ts` (HTTP + the last-resort Claude prompt), `lib/schedule-import/{types,normalize,map-row,pair-legs,duplicates,review,zoned-time,parse-total-fbo,extract-sheet,ocr-tesseract,ocr-vision,preprocess}.ts`, `hooks/use-schedule-import.ts`, `components/flight-operations/schedule-import/*`, `app/flight-operations/import/page.tsx`, tests in `lib/schedule-import/__tests__/` (inline fixtures, no network, no API key). Route errors: see "Extraction engines (free OCR)" (the old 500 for a missing `ANTHROPIC_API_KEY` is gone). It always returns one `ExtractedScheduleSheet`; several files are merged in upload order.

### 2. Extraction schema

Sheet: `sheet_date` (one printed date) or `date_range_start`/`date_range_end`, each `YYYY-MM-DD | null`; `source_software_hint` (software name from the header or footer); `rows`; `raw_text` (debug).
Row (all strings unless noted; `''` = not printed): `tail_number`, `aircraft_type`, `customer`, `group_date` (the day heading the row sits under), `arrival_date`, `arrival_time`, `departure_date`, `departure_time` (24 h `HH:mm`; unparseable text is passed through verbatim), `services` (text), `notes`, `raw_row_text` (whole row on one line, for the review screen), `needs_review` (boolean, the model's own doubt), `confidence` (`high|medium|low`), `page` (number).
The prompt targets printed (not handwritten) tabular schedules in any orientation and over several pages, and tells the model to leave `arrival_date`/`departure_date` empty unless a date is printed in the row itself (the day heading goes in `group_date`, carried across page breaks). The Z/UTC and AM/PM-less cases are copied verbatim and flagged, not converted. If the same aircraft appears in separate Arrivals and Departures sections the model must emit two rows; they are not merged by the model (the pairing step does it, section 3a).

**Action-column sheets (prompt rule added 2026-11-05):** when each row has ONE Date/Time pair plus an Action column, `Arrive` fills `arrival_date`/`arrival_time` and `Depart` fills `departure_date`/`departure_time`, the other pair stays empty; the row's own date is printed in the row, so it goes in `arrival_date`/`departure_date` (not only `group_date`). "Service Duration - ..." text goes to `notes`; lines under "Services Required:" go to `services` (comma separated, empty when nothing follows); a "Confirmed" column date goes to no date field and is appended to `notes` as `Confirmed <date>`; the Type column is copied verbatim into `aircraft_type`; the "Run:" timestamp and page number are ignored; "For The Period: A Through: B" sets `date_range_start`/`date_range_end`.

### 3. Mapping rules (ExtractedScheduleRow -> ScheduleFlightDraft)

- **Tail:** uppercase, strip spaces, dashes and dots (`N 116 FE` -> `N116FE`). N-numbers must match the FAA shape (first digit 1-9, up to 5 digits, or up to 4 digits + 1 letter, or up to 3 digits + 2 letters, no I or O) else `suspicious_tail`; other registrations need 3-7 alphanumerics with a letter. Empty -> `missing_tail` (not importable).
- **Aircraft type (changed 2026-11-05, Ted; printed-text matching added the same day):** the stored type is an ICAO designator. Priority per row (`resolveAircraftType` in `review.ts`): (1) the user's choice in the card (the flight form's `AircraftTypeCombobox`, searched with the printed text as seed); (2) the registry lookup by tail (`/api/aircraft/lookup`, adsbdb; its `icao_type` field is already an ICAO designator, the route drops hits without one, so no normalisation from names is needed; the display name comes from `lib/icao-aircraft-types`); (3) the printed Type text, only when `matchPrintedType` (`resolve-type.ts`) finds exactly one answer: the text is itself a designator (`C525`, `PC-12`) or every word of it appears in exactly ONE row of the ICAO table (`CJ2`, `ENCORE`, `CITATION CJ3`, `KING AIR 350` each match one row; `BRAVO`, `KING AIR`, `350` match several and `G-IVSP` none, so they stay unresolved); (4) unresolved. The printed text is tried only after the lookup finished empty (a running lookup is waited for). An unresolved row shows a "Pick a type" hint and may still be imported as `UNKN`/`Unknown`. An existing aircraft is never changed, whatever the lookup says. Import waits for running lookups (or a user choice), then creates a missing aircraft with the resolved type (ICAO + display).
- **Airports (origin / destination, 2026-11-05):** `ExtractedScheduleRow` has optional `origin` and `destination` (the Claude prompt asks for them only when the sheet has From / Coming From / Last Stop / To / Next Stop columns; `normalizeScheduleSheet` also accepts `from`/`to`/`coming_from`/`next_stop` keys and drops blank tokens; the Total FBO parser sets none because that sheet has no airport columns). A paired arrival+departure takes the origin of the arrival row and the destination of the departure row. In the review, code-shaped text (3 to 4 letters/digits) is looked up in the `airport` table in one query (`findAirportsByCodes`), and `resolveAirportText` (`resolve-airport.ts`, on `lib/airports`) decides: exactly one airport carries the code (IATA, FAA, ICAO or ident) -> resolved, stored as `storedCode()` = the ICAO code (KSEA), the same value the flight form's `AirportCombobox` stores; several airports (GPI) -> ambiguous, ranked with the home country first (`useAirportSettings().homeCountry`, home airport default `DEFAULT_HOME_AIRPORT` KMSO), never auto-picked; none (a place name, a typo) -> unmatched. Ambiguous and unmatched rows show the airport combobox in the card for the user to pick; until picked nothing is written (empty string). Blank printed text stays blank and shows nothing; the home airport is NOT prefilled (unlike the form). Import writes the code into `flight.origin`/`destination` on `add` through `createFlight`; `update` rows (fill-only, D12) do not touch the airports yet. Import waits for the airport query like it waits for type lookups.
- **Date for a time:** the row's own date, else its `group_date`, else the sheet date, else `missing_date`. A departure with no date of its own takes the arrival's date. Month/day-only dates take the year from the heading or sheet; dates are US month-first.
- **Time zone and offset (B10):** wall times are interpreted in the caller-supplied IANA `timeZone` (B45b: the hook passes the FBO time zone setting, `settings.timeZone` from `useAppSettings()`, key `timezone`, default `America/Denver` = Missoula, Montana; an invalid value falls back to `DEFAULT_TIME_ZONE`. It is the FBO zone, never the per-user Zulu toggle. The OCR route does no time conversion, so it needs no zone. The pure functions in `lib/schedule-import` take `timeZone` as a required parameter. `zoned-time.ts` stays instead of `zonedTimeToInstant` from `lib/local-date.ts` because it reports the ambiguous / nonexistent status the shared helper does not) using `Intl`, independent of the process TZ, and emitted as ISO with offset (`2026-03-08T09:00:00-07:00`). A time inside a spring-forward gap moves an hour later (`nonexistent_local_time`); a time that occurs twice at fall-back uses the first (`ambiguous_local_time`). Both are flagged.
- **Direction (D6):** arrival time only -> `arrival_only`; departure time only -> `departure_only`; both -> `both`; neither -> `none` (`no_times`, not importable, since the flight table needs at least one scheduled time). A blank, `TBD`, `-` or `?` time is "unknown", not an error.
- **Midnight rollover:** both times present, departure date not printed, departure wall time earlier than arrival -> departure goes to the next day. A rollover that makes the stay over 12 h is flagged (`rolled_over_long_gap`, probably a misread). A printed departure date earlier than the arrival is never auto-fixed: the departure is dropped and `departure_before_arrival` set.
- **QT:** `isQuickTurn` when both times exist and 0 < elapsed minutes <= 60. Elapsed is real time between the two instants, so DST nights count correctly (01:30 EST -> 03:15 EDT is 45 min). Equal times -> `zero_gap`, not QT.
- **Services:** the services text is split on `, ; |` and matched by synonym to the 15 seed catalog keys of B26 (fuel incl. Jet A, top off and `T/O`; gpu; lav; catering; oxygen; hangar; courtesy_car; rental_car; coffee; ice; dishes; cleaning; maintenance; ground_transport). Unmatched tokens are appended to `notes` as `Services: ...` so nothing printed is lost. B45b must still validate keys against the live catalog once B26 lands.
- **Customer** -> `contact_name`; remarks -> `notes`; `created_by_source` should be set to `front-desk` by the importer.
- **needs_review reasons:** `model_flagged`, `low_confidence`, `missing_tail`, `suspicious_tail`, `unknown_aircraft_type`, `missing_date`, `unparseable_date`, `unparseable_time`, `date_without_time`, `no_times`, `departure_before_arrival`, `rolled_over_long_gap`, `zero_gap`, `ambiguous_local_time`, `nonexistent_local_time`. Labels in `REVIEW_REASON_LABELS`. `needsReview` is `reasons.length > 0`; `importable` is false only for no tail or no usable time.

### 3a. Pairing single-leg rows (`lib/schedule-import/pair-legs.ts`)

Runs after normalisation and before mapping. An arrival-only row (arrival time, no departure time) is merged with a departure-only row of the same tail into one both-times row. Each departure-only row takes the NEAREST EARLIER still-unpaired arrival-only row of its tail, each row is used once, and the departure must be strictly later than the arrival (so Arrive 11/01, Arrive 11/05, Depart 11/06 pairs 11/05 with 11/06 and leaves 11/01 an arrival-only flight). Legs are compared by their own printed date (else the day heading) and time; a leg without a usable date and time, a row without a tail, a row that already has both times and a row with neither are left untouched. The merged row takes the first non-empty type, the arrival row's date/time for arrival and the departure row's for departure, joins customers with ` / ` when they differ, unions the services text, joins distinct notes with `; `, joins `raw_row_text` with ` // `, ORs `needs_review` and takes the lowest confidence. The review item keeps `sourceRows` (the printed rows) so the screen shows a "Paired from 2 rows" badge, lists the printed rows, and offers Unpair (back to one flight per printed row). On the sample: N509CQ departure only, N868CB 11:00 -> 12:00 (60 min, quick turn), N33PX departure only, N555HM 11/21 12:14 -> 11/26 16:00 (not a quick turn).

### 4. Duplicate rule

`findDuplicateFlight(draft, existingFlights, { windowMinutes = 120 })` returns `{ match, suggestion, fills, conflicts, candidateCount }`.
- A candidate is a non-deleted existing flight with the same tail (case, space and dash insensitive) whose scheduled arrival is within the window of the draft's arrival, or whose scheduled departure is within the window of the draft's departure. The closest candidate (smallest summed time distance) is the match. Cancelled flights still match, so a re-import does not resurrect them.
- No match -> `add`. Match -> compare field by field: a value the sheet has and the board lacks (departure time, arrival time, customer, missing service keys) is a **fill** -> `update`; a value set on both sides but different is a **conflict** and is reported but never overwritten -> `skip`. Nothing to fill -> `skip`.
- Consequences: re-importing the same sheet yields zero `add`s (tested, also after staff shifted times on the board). Staff edits are never reverted by an import. If the user really wants the sheet's time, B45b offers it per conflict as an explicit choice.
- The caller should also feed already-accepted drafts of the same import into `existingFlights` so a tail listed twice on one sheet is added once.

### 5. Review-screen contract for B45b (built 2026-11-05)

Implemented as written below, plus: the type column is the tail lookup (section 3), pairing/Unpair (3a), cards at every width (one column on a phone, two-column fields from `sm`), camera and library inputs (`capture="environment"`, `image/*,application/pdf`, several files), a sticky import bar, and these deviations: the user can set the action per duplicate row (skip / update / add) but accepting an individual board conflict is not built (conflicts are only listed, never written, D12); the original scan is stored as an object in the private `scans` bucket under `schedule_sheet/` via `scanned-documents.repo` (`uploadScheduleSheetScan`) with NO `scanned_documents` row, because that table's `doc_type` check only allows `truck_sheet` and `invoice_slip` and widening it is a migration (follow-up). `pure rules` live in `lib/schedule-import/review.ts` (`buildReviewItems`, `evaluateReviewItems`, `planImport`), the writes in `executeImportOperations` (`hooks/use-schedule-import.ts`): aircraft find-or-create, `createFlight` (`created_by_source: front-desk`), `setFlightServices` for the services, `updateFlight` with only the fills and `expectedUpdatedAt`.

- Input: the `ExtractedScheduleSheet`, the app time zone, and `existingFlights` loaded with `findAllFlights({ startDate, endDate })` over the drafts' span padded by one day. Per row compute `draft = mapExtractedRowToFlightDraft(row, { sheetDate: sheet.sheet_date, timeZone })` then `dup = findDuplicateFlight(draft, pool)`. A sheet with only a date range and rows without headings produces `missing_date` rows; the screen must let the user pick a date for them.
- Row state: `include` (default true for `add`/`update` rows without blocking problems; false for `skip`), editable tail, type (ICAO picker, shows `aircraftTypeRaw` when unmatched), customer, arrival and departure date+time, services (catalog picker), notes; the user's choice `add | update | skip` seeded from `dup.suggestion`. After any edit the screen re-runs the duplicate check and re-validates; edits to times recompute `isQuickTurn` with the same 60 minute rule and the departure rollover.
- Badges: review reasons from `REVIEW_REASON_LABELS` (highlight the offending cell), duplicate badge naming the matched flight, with `fills` and `conflicts` listed ("board 14:00, sheet 14:30").
- Blocking: `importable === false` rows cannot be included until fixed. Rows with `needsReview` can be imported but show an unacknowledged state the user must clear (one click) so nothing flagged is imported by accident.
- Import: aircraft find-or-create by tail (type from `aircraftTypeIcao`, else the user must choose one), then `createFlight` for `add`, `updateFlight` with only the `fills` (and any conflicts the user explicitly accepted) for `update`, with `expectedUpdatedAt` for the concurrency check; the original files stored through `scanned-documents.repo`; success toast with counts (added, updated, skipped, errors). Writes go through `flights.repo` only; `flight-form-dialog.tsx` is not touched.
- Tests: component/pure tests plus one Cypress spec that stubs `/api/ocr/schedule-sheet` (no live API call in CI).

### 6. Open questions that need Ted's sample printout

1. ANSWERED by the sample: one table, columns Date | Time | Action | Aircraft | Type | Customer Name | Confirmed, a date range in the title, one leg per row, portrait, one page. The arrival/departure merge post-step is built (3a).
2. ANSWERED: local 12 h with AM/PM (the prompt converts to 24 h). Zulu is still flagged `unparseable_time`, not converted.
3. Does it print a tail for every row (hangar pulls, charters with TBD tails)? Rows without a tail are not importable.
4. ANSWERED: free text and unreliable (CJ2, ENCORE, BRAVO, G-IVSP), so it is not used; the type comes from the tail lookup (section 3).
5. Which services/remarks vocabulary does the desk use (T/O, GPU, lav, car)? The synonym table in `map-row.ts` is a guess from the board and truck sheets.
6. What is the right duplicate window? 120 minutes is a default; confirm real ETA drift. Should a sheet entry with the same tail be treated as the departure of a flight already on the board that has only an arrival (complementary match across days)? Not built.
7. Is there anything on the sheet that should NOT create a flight (maintenance, tows, crew only)?
8. ANSWERED: Missoula, Montana, `America/Denver`, now the `timezone` app setting (default `America/Denver`); the import reads it from `useAppSettings()`.
9. Does the sheet carry customer contact, passenger count, origin or destination that should map to flight fields? Origin and destination: yes if the sheet prints them, see "Airports" in section 3; the sample has none.

### B26 billing answers and TKS (Ted, 2026-11-04)

What the front desk bills, and where each item lives:

1. **Ramp fee**: a flat fee per visit that varies by aircraft type. It is a billable-only item (`product` Ramp Fee, id 8), with no board pill. A Settings-driven ramp-fee schedule by aircraft class (Small GA, Mid-size GA, Light jet, Midsize jet, Heavy jet) is a separate backlog item (B51, design first).
2. **Oil**: sold per can and handed to the customer. Billable-only (`product` Oil (Qt), id 10), no board presence, no `service` row. The sell flow is invoicing scope (B53).
3. **TKS fluid**: sold per gallon, and the ramp helps put it in, so it needs a board service pill with a quantity. Built as B26f below.
4. Nothing else is billed.

Rules that follow: the `product` table is the billing catalog; the `service` table is the board vocabulary only; a service links to a product through the nullable `service.product_id`, which stays NULL until Ted supplies prices and the mapping (B52). No prices are invented and no `product` rows are inserted or altered by B26f. The quantity of a service on a flight lives on `flight_service.quantity` (integer > 0, default 1).

**B26f as built (2026-11-04, local only)**

- Migration `20261104001300_service_tks_fluid_quantity.sql` (rollback in `supabase/rollbacks/`): nullable `service.quantity_unit text` (NULL = plain toggle; a non-blank unit such as 'gal' = the service carries a quantity); seeds `tks_fluid` (label 'TKS Fluid', icon `droplets`, colour token `lime`, sort_order 160, unit 'gal', `product_id` NULL). One transaction, idempotent (`add column if not exists`, `on conflict (key) do nothing`). `set_flight_services` is unchanged: it already takes `{key, quantity}` objects, keeps an existing quantity when a bare key string is sent, and a quantity < 1 fails the `flight_service` check (23514).
- Reads: `FLIGHT_SELECT` embeds `flight_service ( quantity, service:service_id ( key, sort_order, quantity_unit ) )`; `Flight.serviceQuantities` (key -> quantity) holds only services that have a unit; `services` stays `string[]`.
- Writes: create and update pass `{key, quantity}` for the services whose catalog `quantity_unit` is set and that have a quantity, bare keys otherwise (the catalog comes from the cached `['services','active']` query). The compare-and-swap and the "saved but services failed" refresh are unchanged.
- UI: `ServicePillPicker` takes optional `quantities` and `onQuantitiesChange`; a selected quantity service shows a numeric input (min 1, default 1, accessible name 'TKS Fluid quantity (gal)') beside its pill; removing the pill drops its quantity. The card pill reads 'TKS Fluid · 12 gal'. The toolbar filter picks `tks_fluid` up from the catalog.

### PDF scans (client-side, 2026-11-05)

iPhone Files > Scan Documents produces multi-page PDFs (1-7 MB a page). There is no server rasterizer on Railway and no paid API is used, so the browser does it: `frontend/lib/pdf-to-images.ts` (client only) lazy-imports `pdfjs-dist` (pinned 6.5.438; worker through `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, which Turbopack emits as a separate asset), renders one page at a time to a canvas (longest side 2600 px, so iOS Safari canvas memory stays safe), exports JPEG at 0.85, frees the canvas, and returns `File`s named `<scan>-p<n>.jpg` in page order. No rotation (the OCR handles any orientation). Limits: 12 pages a PDF (a notice says the rest was left out); encrypted or corrupt PDFs give a plain message and send nothing. Images pass through unchanged. Both upload screens use it (`schedule-upload.tsx`, `truck-sheet-upload.tsx`) and show "Preparing page 2 of 4...". The schedule route gets all pages in one request as before; the truck sheet page sends one request per page, sequentially (Vision quota 10 requests a minute), and shows a clear message on 429 or 502. The routes still answer 400 to a real PDF (defence). pdfjs is not in any page's initial bundle: the 447 KB library chunk and the 1.27 MB worker asset load only when a PDF is picked. Tests: `lib/__tests__/pdf-to-images.test.ts` (naming, page-cap message, error mapping, pass-through), Cypress `schedule-import.cy.ts` (PDF block, incl. 390 px) and `truck-sheets/truck-sheet-pdf.cy.ts` build a synthetic PDF in the test (`cypress/support/pdf.ts`) and stub the OCR routes.

## Truck sheet OCR (Vision)

Status (2026-11-05): built, in review (backlog B45d). Replaces the paid Claude vision call for truck sheets (no Anthropic credit, none to be spent; Tesseract was tried on these handwritten sheets and returned garbage).

Data flow: `POST /api/ocr/truck-sheet` (FormData `file`, one photo per call, `requireModule('truck_sheets')` unchanged) -> `lib/truck-sheet/ocr-vision.ts` (sharp: EXIF auto-rotate, longest side at most 3000 px, JPEG; Vision `images:annotate`, `DOCUMENT_TEXT_DETECTION`, `languageHints: ['en']`, 30 s timeout; returns words with their 4 corner points) -> `lib/truck-sheet/parse-jet-a.ts` (pure) -> `repair.ts` (pure) -> `ExtractedTruckSheet` JSON, unchanged for the review screen and import hook. Optional additive fields on each reading: `needs_review`, `review_notes`; the review table shows them in the row's warning icon next to the existing meter-math checks.

Engine and errors: Vision when `GOOGLE_VISION_API_KEY` is set. Not set: 503 `Truck sheet scanning is not configured`. The Claude path (old prompt, kept in the route) runs only when there is no Vision key AND `SCHEDULE_OCR_ALLOW_CLAUDE=1` AND `ANTHROPIC_API_KEY` is set; an Anthropic key alone never enables it. PDF: 400 from the route (photos only; no server rasterizer), but the upload control accepts a PDF and rasterizes it client-side, see "PDF scans (client-side)" below. Undecodable image: 400. Vision HTTP error / timeout / network: 502 with a short message; the key is read from `process.env` only, sent in the `x-goog-api-key` header and never put in a URL, log or response. Cost: one Vision unit per photo (free tier 1,000 units a month, quota capped at 10 requests a minute, a 5 USD billing alert set by Ted). The hook calls the route once per page.

Parser (`parse-jet-a.ts`):
1. Orientation. Vision lists each word's corners in reading order, so the median direction of corner 0 to corner 1 is the page rotation (0/90/180/270 or any tilt); all words are rotated upright. No separate orientation detection or image rotation is needed (verified on pages scanned rotated 90 degrees either way and upside down).
2. Rows. Every printed row carries a "Circle / YES" label in the narrow fuel-type column, found on empty rows too, so those labels give the row bands and the row count. A row is `[circle - 0.27 pitch, circle + 0.73 pitch)`.
3. Columns. The header words (Customer, Number, Type, Start, End, Pumped, Starting, Req, Initials, Invoice) are matched to a reference layout measured on a real sheet; the 10 column boundaries are interpolated piecewise-linearly between the headers found (absorbs scale and mild perspective). Words glued across a boundary ("1480715" = 1480 + 715) are split by character position; a single stray edge character is not split off; a duplicate word Vision reports twice is dropped.
4. Header: Month/Day/Year -> `sheet_date`, Truck No., Gallons Down, Front/Rear meter starting number, Init -> `fueler_initials` are the words under their labels; the shaded starting-gallons box is the numeric word in the Starting column above the first row; fuel type from the large title word (Jet A / Avgas). Line Tech Initials are returned raw (uppercase) from the second-to-last column; resolving them to users is B68 (not built). A row whose initials are not two letters is flagged.
5. Cells: customer/tail/type are joined top to bottom (the "N" printed small above the digits is joined); a small raised digit after a meter or gallons number is the tenths digit (`108413.4`); `T/O` is normalised; the Invoice cell's top line is the invoice, the bottom line the 24 h time (a lone 4-digit time on the top line is moved to the time); a row written "Xfer from/to 8370" across the customer, tail and type boxes becomes `transfer_in` / `transfer_out` with the other truck in `tail_number`; `T1..T5` is `tank_fill`; a row with no meters whose remaining went UP by its gallons is inferred as `tank_fill` / `transfer_in`. The front/rear register is assigned per row by the magnitude group nearest the header front number (the rear header is often scribbled over). A page with a header and no handwriting returns the header and zero readings.
6. Not read by OCR (circles are not text): Prist Yes/No (always `''`) and the circled "YES" fuel-type confirmation (always `true`). A later image step (circle detection) could fill them; for now the review screen sets them.

Arithmetic (`repair.ts`), the main accuracy lever: end - start = gallons pumped; each row's meter start = the previous end on the same register (first row: the header starting number); remaining = previous remaining - pumped (+ pumped for tank fills and transfers in; first row: the shaded starting gallons). A broken check is repaired only when exactly one field can be changed by one digit (substitute, insert or delete) so that the check holds and the total number of broken checks drops; with two candidates or more than one digit the value stays as read and the rows are flagged (`needs_review`, `review_notes`). Every repaired value is also flagged and the note names the old and new value. Tolerance 0.05 gal, or 0.55 when tenths and whole numbers are mixed.

Tests: `lib/truck-sheet/__tests__/` (synthetic Vision words built by `synthetic.ts`, no customer data, no network, no key): column/row assignment, rotation 90/180/270/tilt, tenths, glued words, front/rear, transfers, repair rules, header-only page, Vision client errors and key hygiene, route validation. Opt-in `real-vision.test.ts` (`RUN_VISION_TRUCK_TEST=1`, reads the July PDFs from the Desktop, caches the raw Vision JSON in `VISION_CACHE_DIR` so a page is billed once, compares with hand-read ground truth in `VISION_TRUTH_DIR`, report appended to `<cache>/report.txt`); the scans, their Vision JSON and the ground truth are never committed.

Measured accuracy (2 real Jet pages, ground truth read by eye, 3 Vision calls in total): 08-19 page 1 (truck 5282, 10 rows, upright after rotation) 111 of 128 fields exact; 08-23 page 1 (truck 5197, front and rear meters, a transfer, a tank fill, 7 rows) 83 of 97. Meter start/end, gallons pumped and remaining, invoice and time were all exact on the first page; the second lost a scribbled rear header number, one row with a smudged gallons/remaining cell and a time. Weak fields: line tech initials (5 of 10 and 4 of 7: handwriting such as KG reads as "14"/"K4"/"TH"), customer and tail letters (O/0, U/Y/J), aircraft type, the request column (`T/O` struck through, `85/5`). The arithmetic repair fixed one dropped digit and one pair of misplaced digits on page 1 and one wrong remaining on page 2, and flagged the rest. Open: the shaded starting-gallons box read "3304" on a header-only page where the sheet says "330" with an arrow ("<-- empty").

## Truck sheet scan storage and page attachment

Written 2026-11-05 before building (B69). Ted's requirements: every page is stored UPRIGHT, the original scan stays attached to the truck for that day (1 to 3 pages per truck and day, one sheet record, pages in order), the truck page shows the scans per day, and the file layout is fixed before many sheets exist.

### What exists today (investigated)

- `scanned_documents` (migration 20260704000100): one row per stored file, `doc_type` check allows only `truck_sheet` and `invoice_slip`, `storage_path` unique, nullable `truck_sheet_id` and `invoice_id` (on delete set null), `page_number`, no hash, no rotation, no original-file reference, no truck id. It has NO RLS (just `grant all`). The local table is empty.
- Bucket `scans` is private and created by migrations (time card and invoicing). There are NO `storage.objects` policies for it (only `training-certificates` has some). Service role bypasses that, which is how the repo tests pass, but a browser session (role authenticated) cannot upload to or sign URLs in `scans`. The old import hook swallowed upload errors ("best effort"), so a missing policy would have gone unnoticed. The new migration adds them.
- Link scan to sheet today: `scanned_documents.truck_sheet_id` only (set by `uploadScannedDocument`). The import hook stores the JPEG as received (for a PDF: the rendered page JPEG, the PDF itself is never kept, rotation is ignored), path `truck_sheet/<yyyy>/<mm>/<uuid>-<filename>` from the upload day, not the sheet date.
- `truck_sheets` has `fuel_truck_id` (equipment.id), `truck_number`, `sheet_date`, `page_count`; no unique constraint on (truck, date). Nothing reads the scans back: there is no viewer anywhere (`getScanSignedUrl` exists, unused by any page).
- Pages: `/truck-sheets` (list by date), `/truck-sheets/[id]` (one sheet), `/truck-sheets/new` (import). There is NO truck detail page and `/equipment` is a flat list, so a minimal one is added: `/truck-sheets/trucks/[truckNo]`, reached from the truck number on the list and on the sheet page. Same gating as the module (`truck_sheets` in `lib/access.ts`, middleware, RLS "authenticated" on the tables).
- Rotation: `parse-jet-a.ts` already computes the page angle from Vision word geometry (`pageAngleDegrees`, direction of corner 0 to 1, image coordinates so positive = clockwise) and reads the page upright internally, but never reported it. `mergeExtractions` groups pages by `truck_number || file.name` (an unreadable truck number became the file name) and orders by front meter start, then upload order.

### Decisions

Storage layout (bucket `scans`, everything built by `frontend/lib/scan-storage.ts` from validated values only). Revised 2026-11-05 on Ted's decision (format and naming):

```
truck_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/truck-<N>/original/<date>_truck-<N>_scan-<hash8>.<ext>   the upload exactly as received (PDF or photo), the untouched master, once per uploaded file
truck_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/truck-<N>/pages/<date>_truck-<N>_p<page>_<hash8>.jpg      upright page, JPEG q0.92, longest side max 3000 px
truck_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/truck-<N>/thumbs/<date>_truck-<N>_p<page>_<hash8>.jpg     400 px wide JPEG q0.8, made in the same canvas pass
truck_sheet/unassigned/<scan-day>/{original,pages,thumbs}/...                                    holding folder, builder only
schedule_sheet/<YYYY>/<MM>/<YYYY-MM-DD>/{original,pages,thumbs}/<date>_schedule_...             same convention (only the original upload is implemented)
invoice_slip/<YYYY>/<MM>/<YYYY-MM-DD>/...                                                       convention only, not built
```

- `hash8` is the first 8 hex chars of the sha-256 of that file's own bytes (original: the uploaded file; page and thumb: their own JPEG bytes). Identical bytes give the same name, so an object that already exists is reused (free duplicate detection); different bytes (a re-scan) give a different name and nothing is overwritten. No database ids appear in paths, so they survive a DB rebuild. The prefix stays `truck_sheet/` (like the DB `doc_type`); the DB `storage_path`, `thumb_path` and `original_path` columns are the source of truth for where a file is. Old-layout files (`truck_sheet/<yyyy>/<mm>/<uuid>-<name>`, from the first import hook) may exist on live; none exist on the local stack. They are not moved.
- Date and truck number are validated (`YYYY-MM-DD` real calendar date; truck number reduced to `A-Z0-9`, upper case, max 12 chars, must not end empty). The review screen refuses to import a sheet without a valid date and truck number (no more "today" default and no file name as truck number), so `unassigned/` is only the builder's fallback for a caller that has no valid values; the hook never uses it.
- Never overwrite: uploads use `upsert: false`; an existing object under the same name has the same bytes and is reused. Page numbers on a truck/day only grow (append = max + 1). Cleanup after a failed import removes only objects that call created. Replacing or removing pages is a deliberate manual action (not built).
- A multi-page PDF is stored once under `original/`; every page row of it points at that path (`original_path`, `original_page`). A photo is its own original. All page images are re-encoded upright JPEGs (quality 0.92, longest side capped at 3000 px, no upscaling, no PNG), so the stored page is always upright whatever the phone did; the original keeps whatever orientation it came in. Each page also gets a 400 px wide thumbnail (JPEG q0.8) stored under `thumbs/` and recorded in `thumb_path`.

Database (migration `20261105000400_truck_sheet_scan_pages.sql`, local only until Ted approves it live):

- `scanned_documents` gains `thumb_path`, `rotation_degrees smallint` (0/90/180/270, clockwise turn applied to make the page upright; default 0), `content_sha256 text` (hash of the upright page bytes), `original_path text`, `original_page smallint`, `original_content_type text`, `fuel_truck_id` (equipment.id, on delete set null), `scan_date date` (the sheet date).
- `doc_type` check widened to add `schedule_sheet` (rows for schedule sheets are not written yet; the object layout is).
- Unique index `(truck_sheet_id, page_number)` and `(truck_sheet_id, content_sha256)` (partial, where not null) so the same sheet can neither get two page 2s nor the same page twice. Index on `content_sha256` for the "already stored anywhere" lookup.
- RLS enabled on `scanned_documents` with the same policy as `truck_sheets` (all for authenticated), and `storage.objects` policies for bucket `scans` (select, insert, delete for authenticated). Guarded like the existing bucket creation (storage schema may be missing).

Rotation:

- `parseJetA` returns `rotation_degrees` (0/90/180/270) as an additive field on `ExtractedTruckSheet`, plus `rotation_confident` (false when the sheet has fewer than 10 words, no header or table label was found, or the text direction is more than 25 degrees off a right angle). Not confident means 0 is reported and the review screen says "check the orientation".
- Maths: text running at angle a (clockwise, degrees) needs a turn of `-a` rounded to a quarter: text reading downwards (a = 90) needs 270, upside down (180) needs 180, text running upwards (-90) needs 90. Pure functions in `lib/truck-sheet/rotation.ts` (`rotationFromAngle`, `addRotation`, `rotatedSize`), unit tested.
- The client (`lib/scan-image.ts`) draws the page on a canvas rotated by that amount, honoring EXIF the same way the server does (both see the EXIF-corrected image, so the angle matches), shows it as the review thumbnail and uploads exactly that image. Rotate left/right buttons per page re-render the page from the source and change `rotation_degrees` (stored as the turn applied to the received image, so a manual fix is recorded the same way).

Import (per sheet, in `hooks/use-truck-sheet-import.ts` + `repositories/scanned-documents.repo.ts`):

1. Page order: existing grouping and front-meter-start sort, falling back to upload order; `page_number` = position in that order (1..n), or max existing + 1.. when adding to an existing sheet.
2. Upload objects first (original once, then the upright pages). A failed upload aborts that sheet before any row is written and removes the objects already uploaded for it.
3. Create the sheet and readings (new sheets), then insert one `scanned_documents` row per page. If the rows fail, the new sheet is deleted again (readings cascade) and the uploaded objects removed, and the error is reported with the sheet's truck and date. Sheets of the same batch that already completed stay and are listed in the result; failed sheets stay on the screen. A truck sheet without scans can therefore only exist if the cleanup itself fails, which is reported.

Duplicates (pure decision in `lib/scan-duplicates.ts`):

- Same truck + date already has a sheet: the review card shows "A sheet for truck X on DATE already exists (N pages)". Two choices: "Add these pages to the existing sheet (no new readings)" or "Cancel" (discards the card). Import stays disabled until chosen, so a second sheet is never created silently.
- A page whose upright hash is already stored (anywhere) is marked "already stored" in the card, skipped on import and listed in the result message. A new sheet whose pages are all already stored is blocked the same way.
- Limit: the hash is of the re-encoded upright JPEG, so it catches re-importing the same file or PDF page, not a fresh photo of the same paper.

Viewing (changed by B70): the truck's page is now the equipment detail page `/equipment/[id]` (see "Equipment detail page" below). Inside each day's sheet card it shows the stored pages as thumbnails in page order, each opening the upright image in a dialog (signed URL, 1 h) with a link to the original file; the single sheet page shows the same pages. The lists show the stored thumbnails; the dialog loads the upright page. The old `/truck-sheets/trucks/[truckNo]` route only redirects to the equipment page.

Not done: live migration (needs Ted), schedule-sheet and invoice-slip rows, deleting/replacing a stored page, server-side thumbnails (thumbnails are made in the browser).

Built 2026-11-05 (B69). Differences from the plan above: the review screen also shows "Check the orientation" under a page when the reader was not sure; the hash lookup is global (any sheet); schedule-sheet originals now use `schedule_sheet/<date>/...` (the date comes from the extracted sheet, scan day when missing). Tests: vitest `lib/__tests__/scan-storage.test.ts`, `scan-duplicates.test.ts`, `lib/truck-sheet/__tests__/rotation.test.ts` and the rotation cases in `parse-jet-a.test.ts`, repository test `repositories/__tests__/truck-sheet-scans.repo.test.ts` (local Supabase), Cypress `cypress/e2e/truck-sheets/truck-sheet-scans.cy.ts` (OCR route stubbed; imports a 2-page PDF with page 1 reported rotated 90, checks the stored rows and paths, the truck page, the re-import message and adding pages to an existing sheet). The migration is applied to the local stack only; it must be applied to live (with Ted's approval) before the new import is used there, because the new columns and the storage policies do not exist on live.

## Equipment detail page (maintenance items, meter readings, scans)

Built 2026-11-05 (B70). Ted's decision: a truck's page belongs under equipment, not under truck sheets. `/equipment/[id]` (id = `equipment.id`) is reached from the equipment name on the `/equipment` cards and from the truck number on `/truck-sheets` and `/truck-sheets/[id]` (plain text when the user lacks the equipment module). Gating follows the module: `/equipment` prefix maps to the `equipment` module in `lib/access.ts`. The old `/truck-sheets/trucks/[truckNo]` page redirects (truck number matched case-insensitively to `equipment.equipment_id`; unknown number goes to the list).

Layout (cards, no wide tables, checked at 390 px): header card (name, equipment id, type, status badge that can be changed as on the list, last/next maintenance, notes); Maintenance items; Meter readings and scans.

### Maintenance items

Table `equipment_maintenance_item` (migration 20261105000200, rollback in `supabase/rollbacks`): `id`, `equipment_id` (FK equipment, cascade), `title`, `description`, `status` open|resolved, `noted_at` timestamptz (WHEN it was found, user-editable, default now), `noted_by` (users.id, the current user, set by the app), `resolved_at`/`resolved_by`/`resolution_notes` (a check ties `resolved_at` to status resolved), `deleted_at` (soft delete like `flight`), `created_at`, `updated_at` (DB trigger `set_updated_at`, never modified_at). RLS: one "authenticated" policy like `scanned_documents`.

- An open item does NOT change `equipment.status`; status stays a manual setting. The equipment list card shows a count badge ("2 open maintenance items", links to the page).
- Order: open before resolved, newest `noted_at` first in each group (`sortMaintenanceItems`).
- Time zone: the "Noted at" input is a wall-clock `datetime-local` read in the FBO zone (`useDisplayZone().fboZone`, via `toInstantIso` in `lib/local-date.ts`), stored as the UTC instant, shown back in the FBO zone with its MST/MDT suffix. Not the browser zone, not Zulu.
- Actions: add, edit, resolve (time defaults to now, optional notes), reopen, soft delete.
- Layers: `repositories/equipment-maintenance.repo.ts` (Supabase only), `hooks/use-equipment-maintenance.ts` (react-query), `components/equipment/maintenance-items.tsx`, pure helpers in `lib/equipment-maintenance.ts`.

### Meter readings and scans

Truck sheets belong to equipment through `truck_sheets.fuel_truck_id -> equipment.id`. The import sets it by matching the sheet's truck number to `equipment.equipment_id` (creating a fuel_truck equipment row when none exists), so the detail page queries by that FK (`findTruckSheetsForEquipment`) and does no text matching. Scans hang off the sheet (`scanned_documents.truck_sheet_id`), so `useTruckSheetScans(sheetIds)` is reused unchanged and each day's card shows readings and pages together.

Per sheet (newest `sheet_date` first, 30 at first, "Show more" adds 30): fuel type, front/rear meter start (sheet header) to end (last reading with that meter), gallons pumped (fueling lines), starting and remaining gallons (last line with one), initials, link to `/truck-sheets/[id]` (`lib/truck-sheet-summary.ts`). The section renders nothing when the equipment has no sheets, or when the user has no `truck_sheets` access (hidden by `useModuleAccess`, and a failing query also leaves it empty), so non-trucks and restricted roles never see an error.

Not done: who noted/resolved an item is stored (`noted_by`, `resolved_by`) but not yet shown; no per-item attachments or photos; applying the migration to live needs Ted's go.
