-- Airline fuelings typed in the Fuel sheet dialog land in truck_meter_readings (same table the truck-sheet scans
-- fill), and gaps in a truck's meter chain can be annotated and resolved. See docs/PLAN.md "Airline fuelings
-- with meter readings, and meter-gap flagging". Does not touch fuel_tank_readings.

alter table truck_meter_readings
  add column source text not null default 'scan' check (source in ('scan','typed'));

create table meter_gap_annotation (
  id serial primary key,
  fuel_truck_id integer not null references equipment(id) on delete cascade,
  meter text not null check (meter in ('front','rear')),
  -- the point that exposes the gap: a reading, or a truck sheet's header meter start
  to_reading_id integer references truck_meter_readings(id) on delete cascade,
  to_sheet_id integer references truck_sheets(id) on delete cascade,
  expected_start numeric,
  actual_start numeric,
  reason text check (reason in ('meter_roll','forgotten_fueling','typo','other')),
  note text,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meter_gap_annotation_one_target check ((to_reading_id is null) <> (to_sheet_id is null))
);

create unique index uq_meter_gap_annotation_reading on meter_gap_annotation (to_reading_id) where to_reading_id is not null;
create unique index uq_meter_gap_annotation_sheet on meter_gap_annotation (to_sheet_id, meter) where to_sheet_id is not null;
create index idx_meter_gap_annotation_truck on meter_gap_annotation (fuel_truck_id);

alter table meter_gap_annotation enable row level security;
create policy "Authenticated users can manage meter gap annotations"
  on meter_gap_annotation for all
  using (auth.role() = 'authenticated');

grant all on meter_gap_annotation to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

create trigger meter_gap_annotation_set_updated_at
  before update on meter_gap_annotation
  for each row execute function set_updated_at();
