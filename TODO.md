# TODO

Running backlog for fbo-manager. This is the single source of truth for deferred work and
known gaps — check here before starting anything that isn't an explicit, freshly-assigned task.
Keep it scannable: update entries as they're resolved rather than letting it grow indefinitely.

## Backlog / Deferred

### Edit-concurrency: full rollout to remaining forms

Only 3 of 16 edit forms currently have the optimistic-concurrency guard
(`useRecordEditSession` hook, documented in `docs/edit-concurrency.md`):
`frontend/components/fuel-farm/tank-form-dialog.tsx`,
`frontend/components/fuel-dispatch/transaction-form-dialog.tsx`,
`frontend/components/equipment/equipment-form-dialog.tsx`.

The remaining 13 forms without it:
- `frontend/components/flight-operations/flight-form-dialog.tsx`
- `frontend/components/fuel-dispatch/fueler-assign-dialog.tsx`
- `frontend/components/invoicing/fuel-ticket-sheet.tsx`
- `frontend/components/invoicing/invoice-detail-dialog.tsx`
- `frontend/components/invoicing/settle-invoice-dialog.tsx`
- `frontend/components/line-schedule/shift-dialog.tsx`
- `frontend/components/parking/aircraft-sheet.tsx`
- `frontend/components/roles/role-sheet.tsx`
- `frontend/components/training/completion-sheet.tsx`
- `frontend/components/training/course-form-sheet.tsx`
- `frontend/components/truck-sheets/truck-sheet-review.tsx`
- `frontend/components/truck-sheets/truck-sheet-upload.tsx`
- `frontend/components/users/user-sheet.tsx`

Each remaining table needs a `modified_at` DB trigger (the generic `set_modified_at()` Postgres
function, added via a migration in `frontend/supabase/migrations/`) before the hook can be wired
up — most of these tables don't have one yet. This is intentionally deferred, not stalled.

### AI chatbot for fuel dispatch / line-tech support

Long-term vision, explicitly future-phase: line techs talk to a chatbot on their phone to call
in a fueling (tail number + gallons), which creates the `fuel_transaction` record directly,
visible to front desk in a filtered "not yet invoiced" view. Could also proactively ask
clarifying questions on ambiguous scanned data (e.g. truck sheet photo uploads). Full domain
detail (truck sheet workflow, invoice numbering, tank readings) lives outside this repo in
project notes — the shape of the idea is captured here so a future reader knows where to look
and what the eventual integration point is.

**Live constraint:** `fuel_transaction` creation must stay a clean, callable repo/service
function (see `frontend/repositories/transactions.repo.ts` /
`frontend/services/transactions.service.ts`), not buried in UI-only logic, so a future chatbot
tool-call can hook into it without a rewrite.

## Known Gaps

- **`equipment` modified_at trigger is a standalone script, not a migration.** `fuel_tank` and
  `fuel_transaction` have their `set_modified_at()` trigger folded into
  `frontend/supabase/migrations/20260703000300_modified_at_triggers.sql`, but `equipment`'s
  still only exists as `frontend/scripts/equipment-modified-at-trigger.sql` — a leftover from
  before schema management moved to migrations. Should get folded into a proper migration as a
  follow-up (see `docs/edit-concurrency.md`).
- **Three forms still use `Dialog` instead of the house `Sheet` standard** for data entry:
  `flight-operations/flight-form-dialog.tsx`, `fuel-dispatch/fueler-assign-dialog.tsx`,
  `invoicing/settle-invoice-dialog.tsx`. Tracked in `docs/ui-conventions.md`'s status section.
- **Some domains have a tested repository layer but no dedicated CRUD form**: aircraft,
  customers, products, fuelers, certifications. Open question (intentional vs. gap) tracked in
  `docs/form-ux-questions.md`.

## Archived / Historical Reference

- `docs/archive/decouple-from-django.md` — the plan that took the frontend off Django and onto
  direct Supabase integration. Already executed; current state is documented in
  `docs/architecture.md` instead.
- `docs/archive/fuel-farm-redesign.md` — plan to migrate the fuel-farm tank cards from
  hardcoded Tailwind colors to design tokens. Already implemented.
- `docs/archive/TODO.md` — the original Django-era project backlog (circa Oct 2025, pre-Supabase
  decoupling). Almost entirely obsolete (Django migrations, Celery, DRF/OpenAPI codegen, etc.)
  but kept in case an old feature idea buried in there turns out to still be worth mining.
