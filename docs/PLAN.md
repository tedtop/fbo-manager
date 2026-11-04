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
  Status: still open (B18).
- F12 Mobile: split grid is `lg:grid-cols-2` (OK); calendar view is mouse-drag only (calendar-week-view.tsx:78-90, 249-273), unusable on touch. Needs a decision (D4).
  Status: still open (B19; the 390px overflow is tracked as B39 and pinned by `KNOWN BUG M1` in the Cypress mobile spec).
Dead/duplicate code:
- F13 `app/flight-ops/page.tsx` and `app/flight-operations/day-view/page.tsx` just re-export `app/page.tsx`; `split-view/` and `week-view/` are separate near-copies with their own handlers, no toolbar, no fuel order, no concurrency handling (split-view/page.tsx, week-view/page.tsx). No nav links to any of them (grep found none outside the module).
  Status: partly fixed. The duplicate `/flight-ops` route was removed (commit 0909ced); `app/flight-operations/{day-view,split-view,week-view}` still exist, remaining work is B20.
- F14 `flight-board-ui/` (v0 prototype, own package.json) is unreferenced by the app; only mentioned in `.omc/project-memory.json`.
  Status: fixed by B21 (review). Code references removed; the git-ignored `flight-board-ui/` folder is left for Ted to delete.
- F15 Three near-identical `FlightBoard` branches (flight-board.tsx:118-208); `onAddFlight` prop unused there; `any` casts throughout the adapter (types.ts:181-213, use-flights.ts:285-316).
  Status: still open (B20).
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
Playwright (`e2e/docs.e2e.ts`, repo default) and a mirrored Cypress spec under `cypress/e2e/flight-operations/` (D9). Flight-form specs need the local stack (B01); the rest do not.
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
- **B27d (S)**: Playwright + Cypress specs from section 5, README test notes; verify on the local stack once B01 is up.
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
  modified_at   timestamptz not null default now()
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
  modified_at    timestamptz not null default now(),
  unique (flight_id, service_id)
);
create index flight_service_service_id_idx on flight_service (service_id);  -- flight_id covered by the unique index
```

Decisions:
- **flight_id ON DELETE CASCADE**: flights are soft-deleted (`deleted_at`, migration 20261102000000), so a hard delete is rare admin cleanup and orphan junction rows would be meaningless. The soft-delete path never fires the cascade.
- **service_id ON DELETE RESTRICT**: a catalog row in use cannot be dropped; retire it with `active = false` (old flights keep showing it, the picker hides it).
- `color` is a semantic token mapped to the existing tailwind classes in one client map (tailwind's scanner cannot see runtime class strings). `icon` likewise maps a name to a lucide component. Both maps live in `components/flight-operations/service-visuals.ts`.
- Every NOT NULL timestamp has an explicit `default now()` (B01c lesson: live Django-era columns lacked defaults and inserts broke). Wire the generic `set_modified_at()` trigger (20260703000300) on both tables.
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
- **Writes: Postgres RPC** `set_flight_services(p_flight_id bigint, p_keys text[], p_expected_modified_at timestamptz)`, `security invoker` (RLS applies). In one transaction it locks the flight row, raises a conflict when `p_expected_modified_at` is given and differs from `flight.modified_at`, raises on unknown keys, deletes junction rows no longer selected, inserts new ones (retained rows keep quantity/notes/price_override), then bumps `flight.modified_at` (via `update flight set id = id where id = p_flight_id` so the existing trigger fires). Why an RPC rather than a client-side repository function: PostgREST has no multi-statement transaction, so client delete-then-insert can leave partial services after a dropped connection, and two clients can interleave; and a bare junction write would bypass the form's `modified_at` edit-concurrency check because it never touches `flight`. Create is two steps (insert flight, then the RPC); the RPC is idempotent so Save can retry (open question 4 offers a single `create_flight_with_services` RPC instead). Execute granted to authenticated only.
- **Toolbar filter**: `compact-toolbar.tsx` `serviceOptions` (5 hard-coded) comes from `useServices()` (active rows). `board-logic.ts` is unchanged because `flight.services` stays a key array. This also fixes the filter today being unable to select lav, gpu, oxygen, etc.
- **Realtime/polling (B16)**: B16 subscribes to `postgres_changes` on `flight`. Edits through the RPC bump `flight.modified_at`, so that one subscription already fires and invalidates `flightKeys.all`; no second channel is required. Direct junction writes (admin SQL) would only show on the next refetch; optionally also subscribe to `flight_service` in B26c (cheap).
- **Plumbing**: `types.ts` keeps `services: string[]`. `componentFlightToApiRequest` stops feeding `services` into `flight` updates; `use-flights.ts` drops `dbUpdates.services` / the create `services` field and calls the RPC with the picked keys (resolved to ids inside the RPC, so the client never handles ids).
- **Card inline editing** (`localServices`, `isEditingServices`): behavior unchanged, choices from the shared picker, saved through the same mutation path.

### 5. Pricing

- D10 says services carry prices. Stance: the **catalog stores a suggested price, the junction stores an override, invoicing stays the source of money truth.**
- Effective suggested price: `coalesce(price_override, service.default_price, product.price)` (resolved in a view or client function; never copied into invoice rows at flight time).
- `service.product_id` links to `product` (10 live rows: PARK-JET 150, PARK-SGL 25, SVC-GPU 75, SVC-LAV 125, SVC-H2O 45, SVC-DEICE 250, FEE-CATER 50, FEE-RAMP 75, PROD-PRIST 15, PROD-OIL 12.50). Natural pairs: gpu to SVC-GPU, lav to SVC-LAV, catering to FEE-CATER. The migration does **not** populate links or prices (Ted's call, open question 2).
- Invoicing: `invoice_line_items.product_id` and `invoices.flight_id` already exist, so a later item can offer "add this flight's services as invoice lines" at the effective price.
- **Out of scope for B26**: invoice generation from services, any price-editing UI, tax, per-customer pricing, changes to `product` or invoice tables, admin CRUD UI for the catalog (SQL until a later item), per-service permissions, fuel orders (stay on `flight.fuel_order_notes`; `fuel` is just a pill), `quantity`/`notes` inputs in the UI (columns exist, UI writes the defaults 1 and ''), and anything touching `fuel_tank_readings`.

### 6. Test plan

- **Repository/RPC tests** (vitest, local DB): `services.repo` (active sorted; inactive hidden from the picker query); flights repo embed returns `flight_services` and maps to keys; RPC: add/remove, idempotent re-set, unknown key raises, stale `p_expected_modified_at` raises conflict, junction change bumps `flight.modified_at`, cascade on hard flight delete, restrict on catalog delete, UNIQUE(flight_id, service_id).
- **Migration test**: seed a legacy-shaped `flight.services` (with `lavatory`, `transport`, `cleaning`, plus an unknown key) and assert correct mapping, duplicate collapse, and that the unknown key **raises** with the transaction rolled back.
- **Adapter/unit tests**: `rowToFlight` embed to `string[]`; `componentFlightToApiRequest` no longer emits `services`; `board-logic` services filter on keys; picker component (renders catalog pills, toggles, a retired service on a flight still renders).
- **Playwright** (`e2e/`): in the form pick Fuel, Lav and Cleaning, save, assert the same three pills on the card; reopen the form and see them preselected; remove one and verify on the card; toolbar service filter lists catalog items and filters.
- **Cypress**: same flow, plus a backfilled legacy flight (`lavatory`) showing the Lav pill.
- **Live check** (read-only) after apply: counts per section 3 step 6.

### 7. Breakdown

| Item | Scope | Size |
|---|---|---|
| B26a | Migration: tables, seed, RLS, triggers, backfill (fails on unknown), `set_flight_services` RPC; local verify, backup, live apply via B01c, `types/database.ts`, migration test | M |
| B26b | `services.repo`, `use-services`, flight select embed, `rowToFlight`, create/update write via RPC, repo and RPC tests | M |
| B26c | Shared `ServicePillPicker`/`ServicePill` + `service-visuals`; wire card and form fly-out; toolbar filter from catalog; component tests | M |
| B26d | Playwright + Cypress specs, live parity check | S |
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
