# Plan: one name for the "last changed" column, `updated_at`

Status: PLAN ONLY (2026-11-04). Nothing in this document has been run. Ted chose `updated_at` as the single name.

## Why this is not a one-line DB change

`modified_at` is data the app reads and compares, not just a column the database fills. The edit guard is a
compare-and-swap (`UPDATE ... WHERE modified_at = <value loaded into the form>`), the realtime edit-session hook
reads it from change payloads, and the Flight type maps it to `updatedAt`. Renaming it on live without a
matching deploy makes every save and edit-conflict check on the running app fail with "column does not exist".

## Scope (measured 2026-11-04)

Live database (project qkuhvlrdidhumyyxokil), column `modified_at` on 16 tables:
`aircraft, customer, department, department_member, equipment, flight, fuel_tank, fuel_transaction, fueler,
fueler_training, invoice, parking_location, product, schedule_shift, training, users`.
No view, index, constraint or RLS policy uses it. Two trigger functions write it: `set_modified_at()` (15 triggers)
and `update_modified_at_column()` (the flight trigger).

Not on live yet, also use `modified_at`: `service`, `flight_service` (migration 20261104000200, plus the
`set_flight_services` function, which sets `flight.modified_at`) and `airport` (20261104000900).

Already `updated_at` and unchanged: `app_setting, profiles, roles, invoices, training_course, truck_sheets`,
`qt_session` (Minuteman), and the six columns added by 20261104001100.

Code: about 156 occurrences in 30 non-test files, 21 in `types/database.ts`, about 52 in 9 test files, plus
`docs/edit-concurrency.md`, `docs/architecture.md`, `docs/PLAN.md` and three SQL/seed scripts.

Minuteman (`~/src/minuteman`): not affected. It never reads either column; it only writes `qt_session.updated_at`
itself, and `qt_session` is not renamed.

## Decision: rename in place, bundled with the pending release (recommended)

`ALTER TABLE ... RENAME COLUMN` keeps the column's position (the `flight` column order Ted asked for stays) and
keeps defaults, so it is the cleanest. It cannot be done with zero downtime against the old build, but the next
release already has a cutover window: migration 20261104000600 (`flight.aircraft_id` to `tail_number`) breaks the
currently deployed build the same way. So the rename rides in the same cutover and adds no extra window.

Considered and rejected:

- Expand/contract (add `updated_at`, trigger sets both, drop `modified_at` later): zero downtime, but two
  migrations, two deploys, duplicated columns for a while, and `updated_at` lands at the END of each table, which
  would undo the logical `flight` column order.
- A generated `modified_at` alias column for the old build: the deployed build still INSERTs `modified_at`
  (the fuel order workaround), which a generated column rejects.

## Steps

### 1. Code and test change (one commit, no live effect), on a quiet working tree
Do this when no other session has uncommitted edits in the touched files (all sessions share one folder).
Currently uncommitted elsewhere: `cypress.config.ts`, the two realtime specs, `tsconfig.json`, the new
flight-services specs.

- `types/database.ts`: `modified_at` to `updated_at` in 16 Row/Insert/Update types (plus `service`, `flight_service`,
  `airport`).
- Repositories (`flights, equipment, transactions, tanks, schedule, users, services`), hooks
  (`use-record-edit-session` default column `'updated_at'`, `use-flights, use-equipment, use-tanks,
  use-transactions`), `lib/concurrency.ts`, `components/flight-operations/types.ts`, the equipment, fuel-farm,
  fuel-dispatch and flight form dialogs: column names and the `expectedModifiedAt` / `modifiedAt` identifiers become
  `expectedUpdatedAt` / `updatedAt` (the Flight type field is already `updatedAt`).
- Tests: repository tests, Cypress (`flight-edit, flight-services`,
  `cypress.config.ts` tasks), `types.test.ts`.
- Docs: `edit-concurrency.md`, `architecture.md`, `PLAN.md`.

### 2. Migration `20261104001200_rename_modified_at_to_updated_at.sql` (+ rollback), written to run LAST
Catalog-driven and idempotent (skips a table that has no `modified_at` or already has `updated_at`), in one
transaction, with no UPDATE statements:
1. `ALTER TABLE ... RENAME COLUMN modified_at TO updated_at` for every public table that has it.
2. Re-point triggers: drop each trigger that runs `set_modified_at` / `update_modified_at_column`, create
   `trg_<table>_set_updated_at` running the existing `set_updated_at()`. Then drop the two old functions.
3. Rewrite any function whose body mentions `modified_at` (at least `set_flight_services`): take
   `pg_get_functiondef`, replace the word, re-create it. Assert afterwards that no function body still contains it.
4. Do NOT edit already written migrations. Fresh databases replay them in order and the rename runs last; databases
   that already applied them just get the rename.
5. Rollback renames back and restores the old functions and triggers.

### 3. Local proof before anything touches live
- `supabase db reset` on a scratch stack (full replay including the rename), then `pnpm tsc --noEmit`, vitest
  (repositories and components) and the Cypress full suite. Use own ports and `NEXT_DIST_DIR` (other
  sessions hold 4210).
- Edit-conflict specs (`flight-edit`, equipment, fuel) are the ones that prove the compare-and-swap still works.
- Dry-run the migration on a copy of live structure inside a rolled-back transaction.

### 4. Release cutover (needs Ted's explicit go-ahead; the orchestrator sequences it)
Order: pending live migrations (`...200, 500, 600, 700, 900, 1000`) then `...1200` rename, then deploy the commit
built from a clean `git archive` export (`railway up --ci --service web ...`). Apply the rename immediately before
starting the deploy; the old build fails on saves from then until the new build is live (a few minutes). Anyone
with a stale tab needs a hard refresh. Pick a quiet time for the ramp PC.

### 5. Verify after
- Live audit query shows no `modified_at` left and a trigger on every `updated_at` table.
- Prod: create and edit a flight, a fuel order, an equipment edit; open one record in two tabs and confirm the
  conflict dialog still appears.
- Minuteman dashboard: `/fuel_farm`, `/fuel_dispatch` and their APIs return 200 with `dbConnected: true`
  (same checks as before and after 20261104001100).

## Risks

| Risk | Mitigation |
|---|---|
| Old build errors during the few minutes between migration and deploy | Bundled with the tail_number cutover that already has this window; quiet-time run |
| A missed `modified_at` reference compiles but fails at runtime (string column names) | grep gate in CI/review: zero `modified_at` outside migrations and docs; the specs above exercise every table that has an edit guard |
| Other sessions edit the same files meanwhile | Do step 1 on a quiet tree; tell the orchestrator before starting |
| A function body still mentions the old name | Migration step 3 asserts none remain |
| Rename needs rollback | Rollback file; previous Railway deployment can be redeployed |

## Out of scope
Renaming `created_at`; Minuteman tables; adding `updated_at` to append-only logs.
