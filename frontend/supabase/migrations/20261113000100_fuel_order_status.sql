-- B120 / D22: fuel_transaction.status replaces progress (docs/PLAN.md, "Fuel-to-billing and POS design", 4.1).
--   * status (requested|assigned|fueling|filled|cancelled), not null, default 'requested', backfilled from progress
--     (started -> requested, in_progress -> fueling, completed -> filled), then progress is dropped.
--   * New columns: cancel_reason, filled_by (user), requested_for (target time), prist. completed_at is the filled
--     time and assigned_at the assign time; both already exist.
--   * ticket_number gets a sequence default ('FO-' || n), so the board, phone and scans never race a client-side count.
--   * source gains 'phone' and 'scan'. The source and fuel_type checks are Django-era on live, so they are found by
--     the column they cover in pg_constraint (never by a hard-coded name), dropped and re-added. fuel_type keeps its
--     three spellings (DB enums are not changed now; lib/fuel-types.ts maps them).
-- All in one transaction: any failure (for example a live fuel_type value outside the check) rolls everything back.
--
-- Rollback: frontend/supabase/rollbacks/20261113000100_fuel_order_status.down.sql
-- Live apply WAITS FOR TED (back up fuel_transaction first, B01c). When he approves, apply ONLY with
-- supabase db query --linked -f <this file> (never `supabase db push`), then
-- supabase migration repair --linked --status applied 20261113000100

begin;

-- 1. status, backfilled from progress
alter table public.fuel_transaction add column status text;
update public.fuel_transaction set status = case progress
  when 'in_progress' then 'fueling'
  when 'completed' then 'filled'
  else 'requested'
end;
alter table public.fuel_transaction
  alter column status set not null,
  alter column status set default 'requested',
  add constraint fuel_transaction_status_check
    check (status in ('requested', 'assigned', 'fueling', 'filled', 'cancelled'));
alter table public.fuel_transaction drop column progress;

-- 2. new columns (completed_at = filled time, assigned_at = assign time, both reused)
alter table public.fuel_transaction
  add column cancel_reason text,
  add column filled_by integer references public.users(id) on delete set null,
  add column requested_for timestamptz,
  add column prist boolean not null default false;

-- 3. source and fuel_type checks: look up each by the column it covers, drop, re-add
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.fuel_transaction'::regclass
      and c.contype = 'c'
      and array_length(c.conkey, 1) = 1
      and a.attname in ('source', 'fuel_type')
  loop
    execute format('alter table public.fuel_transaction drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.fuel_transaction
  add constraint fuel_transaction_source_check
    check (source in ('qt', 'flight_card', 'manual', 'phone', 'scan')),
  add constraint fuel_transaction_fuel_type_check
    check (fuel_type in ('jet_a', 'jet_a_plus', 'avgas'));

-- 4. ticket_number default from a sequence, started after any existing FO-n ticket
create sequence if not exists public.fuel_order_ticket_seq;
select setval(
  'public.fuel_order_ticket_seq',
  coalesce(
    (select max(substring(ticket_number from '^FO-(\d+)$')::bigint)
       from public.fuel_transaction
      where ticket_number ~ '^FO-\d+$'),
    0
  ) + 1,
  false
);
alter table public.fuel_transaction
  alter column ticket_number set default ('FO-' || nextval('public.fuel_order_ticket_seq'));
grant usage, select on sequence public.fuel_order_ticket_seq to authenticated, service_role;

commit;
