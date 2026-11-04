-- Parking redesign: separate polygon "areas" from aircraft positions.
--
-- parking_location historically mixed two things: admin-drawn polygons (ramp zones,
-- hangars, tie-down rows) and "planes" (rows whose description was JSON with lat/lng).
-- This migration splits them:
--   * parking_area      - admin-drawn polygons only. Planes are never stored here.
--   * aircraft.parked_* - a plane's current position (exact lat/lng + heading) keyed by
--                         tail number, plus a link to the area it sits in. Current
--                         location only; there is no position history log.
--
-- parking_location and flight.location_id are intentionally left in place (the deployed
-- app still reads them); they are only marked deprecated via comments below.

-- ============================================================
-- 1. parking_area
-- ============================================================
create table if not exists parking_area (
  id bigint generated always as identity primary key,
  code varchar(50) not null unique,
  name text not null,
  kind text not null default 'ramp' check (kind in ('ramp', 'hangar', 'tie_down', 'other')),
  -- GeoJSON Polygon: {"type":"Polygon","coordinates":[[[lng,lat],...]]}
  polygon jsonb,
  airport varchar(10) not null default 'MSO',
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  constraint parking_area_polygon_is_polygon
    check (polygon is null or polygon->>'type' = 'Polygon')
);

drop trigger if exists trg_parking_area_set_modified_at on parking_area;
create trigger trg_parking_area_set_modified_at
  before update on parking_area
  for each row execute function set_modified_at();

alter table parking_area enable row level security;

drop policy if exists "Authenticated users can manage parking areas" on parking_area;
create policy "Authenticated users can manage parking areas"
  on parking_area for all
  using (auth.role() = 'authenticated');

-- PostgREST needs explicit grants in a local (non-managed) Postgres instance.
grant all on parking_area to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- ============================================================
-- 2. aircraft position columns
-- ============================================================
alter table aircraft add column if not exists parked_lat numeric(9, 6);
alter table aircraft add column if not exists parked_lng numeric(9, 6);
alter table aircraft add column if not exists parked_heading smallint
  check (parked_heading between 0 and 359);
alter table aircraft add column if not exists parked_area_id bigint
  references parking_area(id) on delete set null;
alter table aircraft add column if not exists parked_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'aircraft_parked_lat_lng_together'
  ) then
    alter table aircraft add constraint aircraft_parked_lat_lng_together
      check ((parked_lat is null) = (parked_lng is null));
  end if;
end $$;

create index if not exists idx_aircraft_parked_area_id on aircraft(parked_area_id);

-- ============================================================
-- 3. Deprecate the old model (kept readable for the deployed app)
-- ============================================================
comment on table parking_location is
  'DEPRECATED: replaced by parking_area + aircraft.parked_* (sample data removed 2026-11-05)';
comment on column flight.location_id is
  'DEPRECATED: replaced by parking_area + aircraft.parked_* (sample data removed 2026-11-05)';
