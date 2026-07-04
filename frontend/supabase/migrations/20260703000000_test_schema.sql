-- Test-database schema for the repository integration tests.
--
-- This mirrors frontend/types/database.ts (the hand-maintained snapshot of the live
-- Supabase schema) closely enough to exercise the query/join/upsert shapes used by
-- frontend/repositories/*.repo.ts. It intentionally uses plain TEXT + CHECK constraints
-- instead of native Postgres ENUMs to keep the migration simple to evolve.
--
-- If you add a new table/column to a repository, update frontend/types/database.ts AND
-- this migration together so `pnpm test:repos` keeps catching drift between the two
-- (that drift — a repo querying a column/table the DB doesn't actually have — is exactly
-- the bug class this test DB exists to catch; see docs/archive or the 2026-07-03 handoff).

create table users (
  id serial primary key,
  username text not null,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  role text not null default 'line' check (role in ('admin','line','frontdesk')),
  phone_number text not null default '',
  employee_id text,
  is_active_fueler boolean not null default false,
  is_active boolean not null default true,
  is_staff boolean not null default false,
  is_superuser boolean not null default false,
  password text not null,
  date_joined timestamptz not null default now(),
  last_login timestamptz,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table aircraft (
  tail_number text primary key,
  aircraft_type_icao text not null default '',
  aircraft_type_display text not null default '',
  airline_icao text not null default '',
  fleet_id text not null default '',
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table fuel_tank (
  tank_id text primary key,
  tank_name text not null,
  fuel_type text not null check (fuel_type in ('jet_a','avgas')),
  capacity_gallons numeric not null,
  min_level_inches numeric not null,
  max_level_inches numeric not null,
  usable_min_inches numeric not null,
  usable_max_inches numeric not null,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table tank_level_readings (
  id serial primary key,
  tank_id text not null references fuel_tank(tank_id) on delete cascade,
  level numeric not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table parking_location (
  id serial primary key,
  location_code text,
  description text not null default '',
  latitude numeric,
  longitude numeric,
  polygon jsonb,
  airport text not null default '',
  terminal text,
  gate text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table terminal_gate (
  id serial primary key,
  terminal_id text not null,
  terminal_num text not null,
  gate_number text not null,
  location_id text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table equipment (
  id serial primary key,
  equipment_id text not null unique,
  equipment_name text not null,
  equipment_type text not null check (equipment_type in (
    'fuel_truck','tug','gpu','air_start','belt_loader','stairs',
    'lavatory_service','water_service','golf_cart','staff_vehicle','other'
  )),
  manufacturer text not null default '',
  model text not null default '',
  serial_number text not null default '',
  status text not null default 'available' check (status in ('available','in_use','maintenance','out_of_service')),
  location text not null default '',
  notes text not null default '',
  last_maintenance_date date,
  next_maintenance_date date,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

-- Seed the fuel truck fleet into the equipment registry (idempotent — safe on
-- both a fresh `supabase db reset` and a `supabase db push` against an
-- already-seeded project).
insert into equipment
  (equipment_id, equipment_name, equipment_type, manufacturer, model,
   serial_number, status, location, notes, created_at, modified_at)
values
  ('5282', 'Fuel Truck 5282 (Jet A, 5,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.', now(), now()),
  ('8178', 'Fuel Truck 8178 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', now(), now()),
  ('8370', 'Fuel Truck 8370 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', now(), now()),
  ('8628', 'Fuel Truck 8628 (Jet A, 3,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Jet A. Capacity: 3000 gal. Front + rear meter registers.', now(), now()),
  ('5183', 'Fuel Truck 5183 (Avgas, 750 gal)',  'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 750 gal. Front meter only.', now(), now()),
  ('8338', 'Fuel Truck 8338 (Avgas, 2,000 gal)', 'fuel_truck', '', '', '', 'available', '', 'Fuel: Avgas 100LL. Capacity: 2000 gal. Front meter only.', now(), now())
on conflict (equipment_id) do nothing;

create table fueler (
  id serial primary key,
  user_id integer not null references users(id) on delete cascade,
  fueler_name text not null,
  handheld_name text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table training (
  id serial primary key,
  training_name text not null,
  description text not null default '',
  validity_period_days integer not null,
  aircraft_type text,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table flight (
  id serial primary key,
  aircraft_id text not null references aircraft(tail_number) on delete cascade,
  call_sign text,
  arrival_time timestamptz,
  departure_time timestamptz not null,
  flight_status text not null default 'scheduled' check (flight_status in ('scheduled','arrived','departed','cancelled','delayed','planned')),
  origin text not null default '',
  destination text not null default '',
  contact_name text not null default '',
  contact_notes text not null default '',
  services text[] not null default '{}',
  fuel_order_notes text not null default '',
  passenger_count integer,
  notes text not null default '',
  location_id integer references parking_location(id) on delete set null,
  created_by_id integer not null references users(id),
  created_by_source text not null default 'front-desk' check (created_by_source in ('qt','front-desk','line-department','google-calendar')),
  fueled_at timestamptz,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table fuel_transaction (
  id serial primary key,
  flight_id integer references flight(id) on delete set null,
  ticket_number text not null,
  quantity_gallons numeric,
  quantity_lbs numeric,
  density numeric,
  progress text not null default 'started' check (progress in ('started','in_progress','completed')),
  charge_flags jsonb,
  assigned_at timestamptz,
  completed_at timestamptz,
  qt_dispatch_id text,
  qt_sync_status text not null default 'pending' check (qt_sync_status in ('pending','synced','failed')),
  fuel_truck_id integer references equipment(id) on delete set null,
  tail_number text,
  fuel_type text check (fuel_type in ('jet_a','jet_a_plus','avgas')),
  source text not null default 'manual' check (source in ('qt','flight_card','manual')),
  ordered_by_id integer references users(id) on delete set null,
  fuel_order_text text,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz
);

create table fueler_training (
  id serial primary key,
  fueler_id integer not null references fueler(id) on delete cascade,
  training_id integer not null references training(id) on delete cascade,
  completed_date date not null,
  expiry_date date not null,
  certified_by_id integer references users(id) on delete set null,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  assigned_fueler_id integer,
  available_at timestamptz,
  unique (fueler_id, training_id)
);

create table fueler_training_history (
  id serial primary key,
  fueler_id integer not null references fueler(id) on delete cascade,
  training_id integer not null references training(id) on delete cascade,
  completed_date date not null,
  expiry_date date not null,
  certified_by_id integer references users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table assigned_training (
  id serial primary key,
  fueler_id integer not null references fueler(id) on delete cascade,
  training_id integer not null references training(id) on delete cascade,
  status text not null default 'assigned' check (status in ('assigned','completed','cancelled')),
  assigned_by_id integer references users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  due_date date,
  notes text not null default '',
  completed_at timestamptz
);

create table fueler_assignment (
  id serial primary key,
  transaction_id integer not null references fuel_transaction(id) on delete cascade,
  fueler_id integer not null references fueler(id) on delete cascade,
  assigned_at timestamptz not null default now()
);

create table department (
  id serial primary key,
  name text not null,
  slug text not null unique,
  color text not null default '#3b82f6',
  settings jsonb not null default '{"allow_self_edit": true, "edit_roles": ["lead", "supervisor"]}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table department_member (
  id serial primary key,
  department_id integer not null references department(id) on delete cascade,
  user_id integer not null references users(id) on delete cascade,
  dept_role text not null default 'member' check (dept_role in ('lead', 'supervisor', 'member')),
  title text not null default '',
  target_weekly_hours numeric(4, 1),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now(),
  unique (department_id, user_id)
);

create table schedule_shift (
  id serial primary key,
  department_id integer not null references department(id) on delete cascade,
  user_id integer not null references users(id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  -- end_time <= start_time means the shift crosses midnight into the next day
  end_time time not null,
  notes text not null default '',
  created_by integer references users(id) on delete set null,
  updated_by integer references users(id) on delete set null,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table customer (
  id serial primary key,
  name text not null,
  email text not null default '',
  phone text not null default '',
  customer_type text not null default 'private' check (customer_type in ('private','military','usfs','ga')),
  address text not null default '',
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table product (
  id serial primary key,
  name text not null,
  description text not null default '',
  sku text not null,
  price numeric not null,
  product_type text not null default 'product' check (product_type in ('fuel','service','fee','product')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table invoice (
  id serial primary key,
  customer_id integer not null references customer(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','issued','paid','void')),
  total_amount numeric not null default 0,
  payment_method text check (payment_method in ('credit_card','cash','check','account')),
  due_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  modified_at timestamptz not null default now()
);

create table invoice_item (
  id serial primary key,
  invoice_id integer not null references invoice(id) on delete cascade,
  product_id integer references product(id) on delete set null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null,
  total_price numeric not null default 0,
  created_at timestamptz not null default now()
);

create table truck_sheets (
  id serial primary key,
  sheet_date date not null,
  fuel_truck_id integer not null references equipment(id) on delete cascade,
  truck_number text not null,
  fuel_type text not null check (fuel_type in ('jet_a','avgas')),
  gallons_down numeric,
  starting_gallons numeric,
  front_meter_start numeric,
  rear_meter_start numeric,
  fueler_initials text,
  page_count integer not null default 1,
  ocr_raw jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table truck_meter_readings (
  id serial primary key,
  truck_sheet_id integer not null references truck_sheets(id) on delete cascade,
  line_number integer not null,
  reading_type text not null default 'fueling' check (reading_type in ('fueling','tank_fill','transfer_in','transfer_out','other')),
  customer text,
  tail_number text,
  aircraft_type text,
  fuel_type_confirmed boolean not null default false,
  meter text check (meter in ('front','rear')),
  meter_start numeric,
  meter_end numeric,
  gallons_pumped numeric,
  gallons_remaining numeric,
  req_gals_or_lbs text,
  prist boolean,
  line_tech_initials text,
  invoice_number text,
  service_time text,
  flight_id integer references flight(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_truck_sheets_date          on truck_sheets(sheet_date desc);
create index idx_truck_sheets_truck         on truck_sheets(fuel_truck_id, sheet_date desc);
create index idx_truck_meter_readings_sheet on truck_meter_readings(truck_sheet_id, line_number);
create index idx_truck_meter_readings_tail  on truck_meter_readings(tail_number) where tail_number is not null;
create index idx_truck_meter_readings_invoice on truck_meter_readings(invoice_number) where invoice_number is not null;

alter table truck_sheets         enable row level security;
alter table truck_meter_readings enable row level security;

create policy "Authenticated users can manage truck sheets"
  on truck_sheets for all
  using (auth.role() = 'authenticated');

create policy "Authenticated users can manage truck meter readings"
  on truck_meter_readings for all
  using (auth.role() = 'authenticated');

-- PostgREST needs explicit grants in a local (non-managed) Postgres instance so the
-- anon/service_role roles it authenticates requests as can actually see these tables.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
