-- parking_map_configurations
-- Stores default map center/zoom/bearing per airport.
-- user_id NULL = airport-wide default; non-null = per-user override.
create table if not exists parking_map_configurations (
  id          uuid        primary key default gen_random_uuid(),
  airport     text        not null,
  user_id     integer     references users(id) on delete cascade,
  center_lat  numeric(10, 7) not null,
  center_lon  numeric(10, 7) not null,
  zoom        numeric(8, 5)  not null,
  bearing     numeric(6, 2)  not null default 0,
  updated_at  timestamptz    not null default now(),

  -- One config per (airport, user) pair; user_id NULL allowed once per airport
  unique nulls not distinct (airport, user_id)
);

-- RLS: all authenticated app users can read and write map configs
alter table parking_map_configurations enable row level security;

create policy "parking_map_configs_select"
  on parking_map_configurations
  for select
  using (true);

create policy "parking_map_configs_insert"
  on parking_map_configurations
  for insert
  with check (true);

create policy "parking_map_configs_update"
  on parking_map_configurations
  for update
  using (true)
  with check (true);

create policy "parking_map_configs_delete"
  on parking_map_configurations
  for delete
  using (true);
