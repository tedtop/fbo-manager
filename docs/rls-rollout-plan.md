# RLS rollout and Django cleanup plan

Status: Phase 0 and Phase 1 are applied to live (see Progress); Phases 2-4 are still plan only.
Written 2026-11-02 from a read-only audit of the live project `qkuhvlrdidhumyyxokil`
("Minuteman Dashboard") and of `~/src/minuteman`.

## Progress

- **Phase 0, done (2026-11-02):** before-snapshot `docs/archive/rls-before-snapshot-2026-11-02.json`
  (metadata only); smoke script `frontend/scripts/rls-smoke.mjs` (GET `limit=0` count probes plus
  the two read-only RPC getters; never writes, never prints keys or rows).
  Run against live before the fix: **anon reached 48 of 48 objects** (all 46 tables and both
  tank getters); RLS-off tables exposed real data (e.g. 146 flights, 228 shifts, 2,551 dispatch
  rows, 3,038 tank readings, 16 users). The 12 RLS-on tables showed 0 rows to anon (their
  policies work).
- **Phase 1, APPLIED TO LIVE 2026-11-02:** `20261102000400_revoke_anon_access.sql`, applied with
  `supabase db query --linked -f`. Smoke on live afterwards: **anon reaches 0 of 48** (was 48 of 48).
  Verified after: Minuteman reads all 7 of its tables with identical row counts and both RPC getters
  return 200 as service_role; the logged-in admin session still loads the board (92 arrivals),
  parking, fuel farm and line schedule. (The Users page shows "Access Restricted" for the dev admin,
  but that predates this change: live `user_roles` has 0 rows, so nobody holds module access; see
  B38.) Local: 22 test files / 201 tests pass after a clean `supabase db reset`.
- **Django cleanup:** `20261102000100` applied (7 Django tables). `20261102000200` (drops
  `terminal_gate`, `users_groups`, `users_user_permissions`, `api_employeeshift`) is written and
  tested locally but was **blocked by the tool permission guard on live** (mass table delete), so it
  is NOT applied. The 4 `terminal_gate` rows are backed up in
  `docs/archive/terminal_gate-backup-2026-11-02.json`. Apply it yourself or allow the action, e.g.
  `supabase db query --linked -f frontend/supabase/migrations/20261102000200_drop_terminal_gate_and_django_leftovers.sql`.
- Next: Phase 2 (RLS + policies per table, B30), starting with Minuteman deny-all tables and `users`.
- Tooling notes: `supabase db query --local -f` rejects multi-statement files (use
  `supabase migration up --local`/`db reset` locally); `--linked -f` handles them. The
  `supabase:push` script in `frontend/package.json` runs `supabase db push`, which must not be
  used on live (B01c).

## 1. Why this is urgent

This app's browser code talks to Supabase directly with the **anon key**, which ships in the
JavaScript bundle (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so anyone who opens the site can copy it.
Row-level security (RLS) is therefore the only access control on the data, and today:

- RLS is **on for 12 of 46** public tables and **off for 34**, including `flight`, `aircraft`,
  `fuel_transaction`, `customer`, `schedule_shift`, `parking_location`, `qt_session`,
  `tank_level_readings`, `fuel_dispatch_history` and `users`.
- The `anon` role (logged-out) and `authenticated` role both hold **every privilege, including
  TRUNCATE**, on every public table (Supabase's default grants; never revoked).
- Net effect: anyone with the public anon key can read, change, or delete rows in the 34 tables
  through Supabase's REST API without logging in. `users` includes a Django `password` hash column.

Not verified by actually calling the API (the grants and `relrowsecurity` flags are proof enough);
Phase 1 includes a check that does exactly that, to confirm the hole is closed.

## 2. What must never break: the Minuteman app

`~/src/minuteman` (Vercel, plain HTML + serverless `api/*.js`) shares this database.

- It connects **only with the service role key**, server-side. Its browser pages never call
  Supabase. The service role **bypasses RLS and grants**, so nothing in this plan can affect it,
  provided we never drop or alter its objects and never revoke privileges from `service_role`.
- Its tables (live row counts 2026-11-02): `tank_level_readings` (3,030), `tank_level_min` (8),
  `fuel_density_readings` (5), `fuel_gravity_readings` (0), `fuel_dispatch_history` (2,551),
  `qt_session` (1, holds QT session data), `adsb_point_cache` (1).
- Its companions, leave in place: `tank_level_readings_backup`, `tank_level_readings_django`.
- Its functions: `get_latest_tank_readings`, `update_tank_level_min`, `get_min_tank_readings`.
- Also never touch `fuel_tank_readings` (separate external app, see memory/README).

Verified after the Django drop below: all of the above exist with unchanged counts.

## 3. Django cleanup

**Done (applied to live by another session, `20261102000100_drop_legacy_django_tables.sql`):**
dropped `auth_group`, `auth_group_permissions`, `auth_permission`, `django_admin_log`,
`django_content_type`, `django_migrations`, `django_session`. None are Minuteman tables.

**Still there, decision needed (Phase 4):**

| Table | Rows | Verdict |
|---|---|---|
| `users_groups`, `users_user_permissions` | 0 | Droppable. Empty, no code refs; only FK is to `users`. Another session deliberately left them; drop with Ted's go-ahead. |
| `api_employeeshift` | 0 | Droppable. Empty, no code refs, no FKs. |
| **`users`** | 16 | **Do NOT drop.** Not dead: 13 tables FK to it (`flight.created_by_id`, `fuel_transaction.ordered_by_id`, `schedule_shift` x3, `department_member`, `training_completion` x2, `fueler`, `fueler_training*`, `assigned_training`) and `repositories/users.repo.ts` queries it. Clean up its Django columns instead (`password`, `is_superuser`, `is_staff`, `last_login`) after confirming nothing reads them. Longer term: reconcile with Supabase-auth `profiles`. |

Candidates to review (not dead for certain): `invoice`, `invoice_item` (app uses `invoices`,
`invoice_line_items`), `assigned_training`, `training`, `fueler_training`,
`fueler_training_history` (app uses `training_course`, `training_completion`; `fueler_training`
is queried by 3 files). Check code + row counts before deciding.

## 4. Table classification

| Group | Tables | Target policy |
|---|---|---|
| **A. Minuteman-owned** (service role writes) | `qt_session`, `adsb_point_cache`, `fuel_dispatch_history`, `fuel_density_readings`, `fuel_gravity_readings`, `tank_level_min`, `tank_level_readings_backup`, `tank_level_readings_django` | RLS on, **no policies** (deny anon and authenticated). Nothing in this app queries them. |
| A'. Minuteman-owned, read by this app | `tank_level_readings` (Fuel Farm screen, 4 files) | RLS on, `SELECT` for `authenticated` only; no write policy (Minuteman writes via service role). |
| **B. FBO operational** (browser, logged-in) | `flight`, `aircraft`, `parking_location`, `customer`, `department`, `department_member`, `schedule_shift`, `fuel_transaction`, `fuel_tank`, `fueler`, `fueler_assignment`, `fueler_training`, `product`, `scanned_documents`, `terminal_gate` | RLS on. `SELECT` for `authenticated`; writes gated with the existing `has_module_access('<module>', 'edit')` helper (pattern already used on `equipment`, `invoices`, `roles`). |
| B'. Logging | `app_error_log` | RLS on; `INSERT` for `authenticated`, `SELECT` via module access or service role only. |
| **C. Identity** | `users` | RLS on; `SELECT` for `authenticated` (names are shown across the UI) but with column privilege on `password` revoked; writes via service role/admin routes only. |
| **D. Already on** | `equipment`, `invoices`, `invoice_line_items`, `invoice_fuel_readings`, `truck_sheets`, `truck_meter_readings`, `training_course`, `training_completion`, `profiles`, `roles`, `user_roles`, `module_permissions` | Audit only: confirm each policy is not `using (true)` for `anon`, confirm write policies exist. |

Module names for `has_module_access` need a pass against `module_permissions` (do not invent new
ones; map each B table to an existing module such as flight-operations, fuel-dispatch,
line-schedule, parking, users).

Related objects:
- View `truck_sheet_running_totals`: views skip RLS by default. Set `security_invoker = true`.
- Functions: revoke `EXECUTE` from `anon`/`public` on every function except where deliberately
  public. Check each for `SECURITY DEFINER` (those run as owner and bypass RLS).
- `flight` is in the `supabase_realtime` publication (edit-concurrency). Realtime respects RLS,
  so the `authenticated` `SELECT` policy on `flight` is required for live updates.
- The app queries `time_card_scan` but it is **not in the live database** (the
  `20260704000000_time_card_schema.sql` migration was never applied live). Separate issue, noted so
  it is not mistaken for an RLS bug.

## 5. Phases

Ground rules for every phase: one migration per step; apply to live **only** with
`supabase db query --linked -f <file>` (never `supabase db push`, see README and B01c); test on the
local stack first (`pnpm supabase:start`, see STATE.md B01); each step ships with a one-line
rollback; check Minuteman's counts/functions before and after.

### Phase 0. Safety net (S)
- Record live row counts for all 46 tables and the full policy/grant listing to
  `docs/archive/` as a before-snapshot.
- Write a smoke script that calls the REST API as `anon` and as a logged-in test user and
  asserts allowed/denied per table. It is the acceptance test for every later phase.
- Confirm Minuteman smoke: `/api/fuel_farm/tanks` and `/api/dispatch-history` on its Vercel
  deploy return data (read-only).

### Phase 1. Close the anonymous hole (S, highest value)
One migration:
```sql
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;
```
Why it is low risk: this app requires login before showing anything (middleware redirects) and
the login/quick-dev-login/invite flows use Supabase Auth endpoints, not tables; Minuteman uses
`service_role`. Acceptance: smoke script shows `anon` denied on every table; login, board,
parking, fuel screens and Users invite still work in the browser; Minuteman smoke still passes.
Rollback: `grant ... to anon` per table (listing saved in Phase 0).

### Phase 2. RLS + policies, table by table (M, several migrations)
Order by risk, one migration per group, each tested locally against the smoke script:
1. Group A (deny-all) + A' (`tank_level_readings` read-only).
2. Group C `users` (+ column revoke on `password`).
3. Group B core: `flight`, `aircraft`, `parking_location`, `customer`.
4. Group B rest: `fuel_transaction`, `fuel_tank`, `fueler*`, `schedule_shift`, `department*`,
   `product`, `scanned_documents`, `terminal_gate`, `app_error_log`.
5. Group D audit fixes and `truck_sheet_running_totals` `security_invoker`.

Per table: `alter table x enable row level security;` + explicit policies; never `using (true)`
for `anon`. Rollback: `alter table x disable row level security;`.

### Phase 3. Tests (M)
Extend `repositories/__tests__` with an RLS suite against the local stack: as `anon` (denied),
as `authenticated` without module access (read per policy, write denied), as a user with
`edit`. Add the smoke script to CI beside the existing suites.

### Phase 4. Cleanup (S)
- Drop `users_groups`, `users_user_permissions`, `api_employeeshift` (empty, no references) once
  Ted confirms.
- Review the "candidates" in section 3; drop or keep each with a recorded reason.
- Drop Django columns from `users`; consider merging into `profiles`.
- Adopt the guard: a lint/CI check that fails if a new migration creates a public table without
  `enable row level security`.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Breaking Minuteman | It uses service role only (verified in all 7 `api/` files); never alter its tables/functions; counts + smoke before/after each phase. |
| Locking the app out of its own data | Test on the local stack with the real app first; each migration has a rollback; apply one at a time. |
| Hidden anon reader (a page or script using the anon key unauthenticated) | Phase 0 smoke covers the known screens; Phase 1 is reversible per table. |
| Another session editing the same repo | Migrations are new files with unique timestamps; coordinate via STATE.md. |
| Applying to live without history | Single-file `db query --linked -f`; record each applied file in STATE.md. |

## 7. Open questions for Ted

1. Confirm the three empty Django leftovers (`users_groups`, `users_user_permissions`,
   `api_employeeshift`) can go.
2. Which module name should each Group B table map to (default proposal in section 4)?
3. OK to run Phase 1 on live as soon as the Phase 0 smoke script exists?
