-- Equipment types are an editable list (app_setting key equipment_types, edited on the Settings page), so
-- equipment.equipment_type can no longer be limited to a fixed set in the database. Drop the CHECK; the
-- column stays NOT NULL text and the app validates the list. Idempotent.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.equipment'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%equipment_type%'
  loop
    execute format('alter table public.equipment drop constraint %I', c);
  end loop;
end $$;
