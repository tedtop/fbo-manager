-- Rollback for 20261113000100_fuel_order_status.sql: restores progress from status and removes the new columns.
-- Lossy by design: assigned and cancelled orders both come back as 'started' (progress has no such values), and the
-- cancel reason, filled_by, requested_for and prist values are dropped. phone and scan orders become 'manual'.
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261113000100
begin;

alter table public.fuel_transaction add column progress text;
update public.fuel_transaction set progress = case status
  when 'fueling' then 'in_progress'
  when 'filled' then 'completed'
  else 'started'
end;
alter table public.fuel_transaction
  alter column progress set not null,
  alter column progress set default 'started',
  add constraint fuel_transaction_progress_check
    check (progress in ('started', 'in_progress', 'completed'));

alter table public.fuel_transaction alter column ticket_number drop default;
drop sequence if exists public.fuel_order_ticket_seq;

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
      and a.attname in ('source', 'status')
  loop
    execute format('alter table public.fuel_transaction drop constraint %I', con.conname);
  end loop;
end $$;

update public.fuel_transaction set source = 'manual' where source in ('phone', 'scan');
alter table public.fuel_transaction
  add constraint fuel_transaction_source_check
    check (source in ('qt', 'flight_card', 'manual'));

alter table public.fuel_transaction
  drop column status,
  drop column cancel_reason,
  drop column filled_by,
  drop column requested_for,
  drop column prist;

commit;
