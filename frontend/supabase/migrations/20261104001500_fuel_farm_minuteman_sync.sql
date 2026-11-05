-- Bring the fuel farm in line with the Minuteman Dashboard (~/src/minuteman):
--   * fuel_tank rows match Minuteman's api/fuel_farm/tanks.js tankConfig, incl.
--     the Life Flight tank (LF) that was missing, T7's real capacity/limits and
--     the physical (max) vs usable (usable_max) level split used for overfill.
--   * tank_level_min / update_tank_level_min / fuel_gravity_readings already
--     exist on the shared live DB (owned by Minuteman); the IF NOT EXISTS /
--     CREATE OR REPLACE statements below are no-ops there and only create them
--     on a fresh local database.

insert into fuel_tank
  (tank_id, tank_name, fuel_type, capacity_gallons,
   min_level_inches, max_level_inches, usable_min_inches, usable_max_inches)
values
  ('T1', 'Tank 1',      'avgas', 12000, 1,  96, 16,  86),
  ('T2', 'Tank 2',      'jet_a', 12000, 1,  96, 16,  86),
  ('T3', 'Tank 3',      'jet_a', 12000, 1,  96, 16,  86),
  ('T4', 'Tank 4',      'jet_a', 12000, 1,  96, 16,  86),
  ('T5', 'Tank 5',      'jet_a', 12000, 1,  96, 16,  86),
  ('T6', 'Tank 6',      'jet_a', 12000, 1,  96, 16,  86),
  ('T7', 'Tank 7',      'jet_a', 18034, 1, 114, 14,  93),
  ('LF', 'Life Flight', 'jet_a', 10000, 1, 104,  1, 104)
on conflict (tank_id) do update set
  tank_name        = excluded.tank_name,
  fuel_type        = excluded.fuel_type,
  capacity_gallons = excluded.capacity_gallons,
  min_level_inches = excluded.min_level_inches,
  max_level_inches = excluded.max_level_inches,
  usable_min_inches = excluded.usable_min_inches,
  usable_max_inches = excluded.usable_max_inches;

create table if not exists tank_level_min (
  tank_id     varchar(10) primary key,
  level       decimal(5,2) not null,
  recorded_at timestamptz not null
);

create or replace function update_tank_level_min(
  p_tank_id varchar(10),
  p_level decimal(5,2),
  p_recorded_at timestamptz
)
returns void
language sql
as $$
  insert into tank_level_min (tank_id, level, recorded_at)
  values (p_tank_id, p_level, p_recorded_at)
  on conflict (tank_id) do update
    set level = excluded.level, recorded_at = excluded.recorded_at
    where excluded.level < tank_level_min.level;
$$;

insert into tank_level_min (tank_id, level, recorded_at)
select distinct on (tank_id) tank_id, level, recorded_at
from tank_level_readings
where length(tank_id) <= 10
order by tank_id, level asc, recorded_at asc
on conflict (tank_id) do update
  set level = excluded.level, recorded_at = excluded.recorded_at
  where excluded.level < tank_level_min.level;

create table if not exists fuel_gravity_readings (
  id bigserial primary key,
  observed_temp_f decimal(5,2) not null,
  observed_api_gravity decimal(5,2) not null,
  computed_api_gravity_60 decimal(5,2) not null,
  wheel_api_gravity_60 decimal(5,2) not null,
  driver_api_gravity decimal(5,2) not null,
  driver_specific_gravity decimal(6,4),
  gallons_delivered decimal(8,2) not null check (gallons_delivered > 0),
  acceptable boolean not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index if not exists idx_fuel_gravity_readings_recorded
  on fuel_gravity_readings (recorded_at desc);

grant select, insert, update, delete on tank_level_min, fuel_gravity_readings to authenticated;
grant usage, select on sequence fuel_gravity_readings_id_seq to authenticated;
revoke all on tank_level_min, fuel_gravity_readings from anon;
