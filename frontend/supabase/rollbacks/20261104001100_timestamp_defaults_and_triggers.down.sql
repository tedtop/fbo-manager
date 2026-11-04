-- Rollback for 20261104001100_timestamp_defaults_and_triggers.sql.
-- Drops the triggers it created, drops the six updated_at columns it added (their values are only copies
-- of created_at / now(), nothing else depends on them) and removes the two DEFAULT now() pairs.
-- fuel_tank and users inserts must then send created_at and modified_at themselves again (the live
-- pre-state; a local database that already had those defaults loses them too).
--
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261104001100

begin;

do $$
declare
  t text;
begin
  foreach t in array array[
    'aircraft', 'customer', 'department', 'department_member', 'equipment', 'fueler', 'fueler_training',
    'invoice', 'parking_location', 'product', 'schedule_shift', 'training', 'users'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_set_modified_at', t);
  end loop;

  foreach t in array array[
    'invoices', 'training_course', 'truck_sheets', 'truck_meter_readings', 'invoice_line_items',
    'scanned_documents', 'module_permissions', 'training_completion', 'invoice_item'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_set_updated_at', t);
    end if;
  end loop;

  foreach t in array array[
    'truck_meter_readings', 'invoice_line_items', 'scanned_documents', 'module_permissions',
    'training_completion', 'invoice_item'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I drop column if exists updated_at', t);
    end if;
  end loop;
end $$;

alter table public.fuel_tank
  alter column created_at drop default,
  alter column modified_at drop default;
alter table public.users
  alter column created_at drop default,
  alter column modified_at drop default;

commit;
