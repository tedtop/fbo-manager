-- Fuel truck daily log (B71): daily filter/nozzle pressure readings, filter changes, dated notes, and when a
-- truck went down. Replaces the one-off equipment.dpi_reading text column (20261105000300).
--   DPI = differential pressure across the filter vessel (psi); nozzle PSI = pressure at the fueling nozzle.
-- All tables soft delete via deleted_at, updated_at is DB-owned (set_updated_at), RLS like equipment_maintenance_item.

alter table equipment drop column if exists dpi_reading;

-- when status last changed, so a down truck can show "out of service since ..."
alter table equipment add column status_changed_at timestamptz not null default now();
create or replace function equipment_stamp_status_changed() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then new.status_changed_at = now(); end if;
  return new;
end $$;
create trigger trg_equipment_status_changed before update on equipment
  for each row execute function equipment_stamp_status_changed();

create table equipment_reading (
  id bigint generated always as identity primary key,
  equipment_id integer not null references equipment(id) on delete cascade,
  read_at timestamptz not null default now(),
  dpi_psi numeric(5,1) check (dpi_psi >= 0),
  nozzle_psi numeric(5,1) check (nozzle_psi >= 0),
  notes text not null default '',
  read_by integer references users(id) on delete set null,
  -- set when the reading came from a truck sheet (later); manual entries leave it null
  truck_sheet_id integer references truck_sheets(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dpi_psi is not null or nozzle_psi is not null)
);
create index idx_equipment_reading_equipment on equipment_reading (equipment_id, read_at desc) where deleted_at is null;

create table equipment_filter_change (
  id bigint generated always as identity primary key,
  equipment_id integer not null references equipment(id) on delete cascade,
  changed_at timestamptz not null default now(),
  filter_description text not null default '',
  dpi_at_change numeric(5,1) check (dpi_at_change >= 0),
  notes text not null default '',
  changed_by integer references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_equipment_filter_change_equipment on equipment_filter_change (equipment_id, changed_at desc) where deleted_at is null;

create table equipment_note (
  id bigint generated always as identity primary key,
  equipment_id integer not null references equipment(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  noted_at timestamptz not null default now(),
  noted_by integer references users(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_equipment_note_equipment on equipment_note (equipment_id, noted_at desc) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['equipment_reading', 'equipment_filter_change', 'equipment_note'] loop
    execute format('create trigger trg_%s_set_updated_at before update on %I for each row execute function set_updated_at()', t, t);
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy "Authenticated users can manage %s" on %I for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')$p$, t, t);
  end loop;
end $$;
