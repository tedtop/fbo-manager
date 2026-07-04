# Edit Concurrency

Multiple staff can open the same record's edit `Sheet`/`Dialog` at the same time. Without any
concurrency awareness, whoever saves last silently overwrites the other person's changes. This
is optimistic concurrency with live presence — not a hard lock. A hard lock is the wrong tool
here: browser tabs crash and laptops close mid-edit, and a stuck lock would strand the record
for everyone.

Two independent mechanisms, both provided by a single hook:

## 1. Presence — "Ted is also editing this"

While a record's edit form is open, we join a Supabase Realtime Presence channel scoped to
`edit-session:{table}:{id}`. Every other browser tab with that same record open sees a banner
listing who else is in there. This is purely informational — it doesn't block anything.

## 2. Save-time conflict detection (atomic compare-and-swap)

When the form loads, it captures the record's current `modified_at`. On save, the write itself
is the check — there is no separate "read timestamp, then write" round trip (that would leave a
race window between the check and the write). Instead:

```sql
UPDATE fuel_tank
SET ..., -- no modified_at here; a DB trigger sets it (see below)
WHERE tank_id = :id AND modified_at = :expected_modified_at
RETURNING *;
```

If zero rows come back, someone else saved a change since the form loaded — atomically detected,
no separate check step. The caller gets a `ConcurrencyConflictError` and shows a dialog with two
choices: **"Reload their changes"** (re-fetch the record and discard local edits) or
**"Overwrite anyway"** (retry the write with no guard, accepting you're clobbering their change).
The choice is logged via `console.info` — there's no `notes`/audit field on these tables to write
it into, but it isn't dropped silently either.

### Why the live-change banner exists too

The compare-and-swap above is only checked when *you* try to save. To make the experience
proactive instead of purely reactive, the hook also subscribes to Supabase Realtime
`postgres_changes` UPDATE events for the specific record (`id=eq.<id>`, or the table's actual PK
column). If another save lands while your Sheet is still open, you see the same
reload/keep-editing choice immediately — you don't have to hit save to find out. The
compare-and-swap on save remains the final safety net regardless (it covers the case where the
subscription drops, is delayed, or never connects).

### The `modified_at` trigger requirement

The compare-and-swap only works if `modified_at` is **guaranteed** to change on every write. Both
`fuel_tank` and `fuel_transaction` originally carried a Django-managed `modified_at` column
(`auto_now=True`), but `auto_now` is enforced by the Django ORM at `save()` time. It does nothing
for writes that skip the ORM — and the frontend writes both tables directly via Supabase PostgREST
(`frontend/repositories/tanks.repo.ts`, `transactions.repo.ts`), never touching Django. (This
project has since fully decoupled from Django — see the no-Django convention for schema changes
below.)

Before this feature, `modified_at` was **not** being updated by frontend writes at all.
`frontend/supabase/migrations/20260703000300_modified_at_triggers.sql` adds a `BEFORE UPDATE`
Postgres trigger (`set_modified_at()`) on `fuel_tank` and `fuel_transaction` so `modified_at`
updates at the database level regardless of write path. It also registers both tables with the
`supabase_realtime` publication so `postgres_changes` events actually fire for them. Schema for
this project lives entirely in `frontend/supabase/migrations/` — applied locally via
`pnpm supabase:reset` and to staging/prod via `supabase db push`; there is no separate manual-SQL
step for schema changes.

**If you adopt this pattern for another table, check first whether that table has a comparable
trigger.** As of this writing, no other table has one — `modified_at`/`created_at` fields
elsewhere (equipment, training, invoicing, user management, etc.) have the same silent-gap risk if
they're written to directly via Supabase without a trigger. Add a trigger for your table using the
existing `set_modified_at()` function (it's generic — a two-line
`CREATE TRIGGER ... EXECUTE FUNCTION set_modified_at();` in a new migration under
`frontend/supabase/migrations/`), and add the table to `supabase_realtime` the same way, before
wiring up the hook. Don't assume a trigger exists just because one table has it.

## Using the hook

```tsx
import { useRecordEditSession } from '@/hooks/use-record-edit-session'
import { EditSessionStatus } from '@/components/shared/edit-session-status'

const editSession = useRecordEditSession({
  table: 'fuel_tank',        // must have a modified_at trigger — see above
  idColumn: 'tank_id',       // defaults to 'id'
  recordId: tank?.tank_id ?? null,
  modifiedAt: tank?.modified_at ?? null,
  enabled: open && !!tank,   // typically the Sheet/Dialog's open state, gated on "editing"
  onReload: (freshRow) => setFormData(mapRowToFormData(freshRow))
})

// In the form's submit handler:
const outcome = await editSession.save((expectedModifiedAt) =>
  onSubmit(formData, expectedModifiedAt)
)
if (outcome.status === 'conflict') return // dialog is shown by <EditSessionStatus>

// In the JSX, near the top of the Sheet/Dialog content:
<EditSessionStatus editSession={editSession} onOverwriteComplete={() => onOpenChange(false)} />
```

The repository's update function needs to accept an optional `expectedModifiedAt` and use it as
an `.eq('modified_at', expectedModifiedAt)` guard, throwing `ConcurrencyConflictError` (from
`@/lib/concurrency`) when the write matches zero rows. See `updateTank` in
`frontend/repositories/tanks.repo.ts` and `updateTransaction` in
`frontend/repositories/transactions.repo.ts` for the reference implementation.

## Reference implementations

- `frontend/components/fuel-farm/tank-form-dialog.tsx` / `frontend/app/fuel-farm/page.tsx`
- `frontend/components/fuel-dispatch/transaction-form-dialog.tsx` / `frontend/app/dispatch/page.tsx`

This pass intentionally only wires up these two modules. Roll the pattern out to other
`Sheet`/`Dialog` edit forms incrementally, checking the `modified_at` trigger situation for each
table first.
