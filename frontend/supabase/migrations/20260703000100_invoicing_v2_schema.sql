-- Adds the invoices/invoice_line_items/invoice_fuel_readings tables introduced by the
-- "digital fuel tickets" invoicing rebuild (frontend/repositories/invoices.repo.ts,
-- customers.repo.ts, products.repo.ts, fueling-events.repo.ts). This is the module the
-- 2026-07-03 handoff flagged as previously silently failing to persist — see
-- frontend/repositories/__tests__/invoices.repo.test.ts.
--
-- The older `invoice` / `invoice_item` tables from 20260703000000_test_schema.sql are a
-- superseded "billing-cycle" design that's no longer queried by any repository; left in
-- place there only because frontend/types/database.ts still declares them.

create table invoices (
  id serial primary key,
  invoice_number text not null,
  invoice_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','open','paid','void')),
  customer_id integer references customer(id) on delete set null,
  customer_name text not null,
  station text,
  tail_number text,
  aircraft_type text,
  flight_id integer references flight(id) on delete set null,
  payment_method text check (payment_method in ('cash','eom','roa','check','credit_card')),
  check_number text,
  paid_at timestamptz,
  settled_via text check (settled_via in ('cash','check','credit_card','account_credit')),
  settlement_reference text,
  salesman_initials text,
  total numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoice_line_items (
  id serial primary key,
  invoice_id integer not null references invoices(id) on delete cascade,
  line_number integer not null default 1,
  item_type text not null default 'service' check (item_type in ('fuel','service','fee','product')),
  product_id integer references product(id) on delete set null,
  truck_meter_reading_id integer references truck_meter_readings(id) on delete set null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  fuel_type text check (fuel_type in ('jet_a','avgas_100','avgas_80','unleaded')),
  density numeric,
  requested_amount text,
  service_time text,
  created_at timestamptz not null default now()
);

create table invoice_fuel_readings (
  id serial primary key,
  line_item_id integer not null references invoice_line_items(id) on delete cascade,
  position text not null check (position in ('left','right','center','total')),
  reading_start numeric not null,
  reading_end numeric not null,
  created_at timestamptz not null default now()
);

grant all on invoices, invoice_line_items, invoice_fuel_readings to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
