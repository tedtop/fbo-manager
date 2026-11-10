-- B70: equipment maintenance items. A short log of problems found on a piece of equipment ("Dead battery"),
-- with WHEN it was discovered (noted_at, user-editable, defaults to now), who noted it, and how it was resolved.
-- An open item does NOT change equipment.status (that stays a manual setting). Soft delete via deleted_at, like flight.
-- updated_at is DB-owned (set_updated_at trigger, same as the other tables).

create table equipment_maintenance_item (
  id bigint generated always as identity primary key,
  equipment_id integer not null references equipment(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  noted_at timestamptz not null default now(),
  noted_by integer references users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by integer references users(id) on delete set null,
  resolution_notes text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a resolved item has a resolved_at; an open one does not
  check ((status = 'resolved') = (resolved_at is not null))
);

create index idx_equipment_maintenance_item_equipment
  on equipment_maintenance_item (equipment_id, noted_at desc)
  where deleted_at is null;

create trigger trg_equipment_maintenance_item_set_updated_at
  before update on equipment_maintenance_item
  for each row execute function set_updated_at();

alter table equipment_maintenance_item enable row level security;
create policy "Authenticated users can manage equipment maintenance items"
  on equipment_maintenance_item for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
