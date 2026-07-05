-- Adds the invoices/invoice_line_items/invoice_fuel_readings tables introduced by the
-- "digital fuel tickets" invoicing rebuild (frontend/repositories/invoices.repo.ts,
-- customers.repo.ts, products.repo.ts, fueling-events.repo.ts). This is the module the
-- 2026-07-03 handoff flagged as previously silently failing to persist — see
-- frontend/repositories/__tests__/invoices.repo.test.ts.
--
-- The older `invoice` / `invoice_item` tables from 20260703000000_test_schema.sql are a
-- superseded "billing-cycle" design that's no longer queried by any repository; left in
-- place there only because frontend/types/database.ts still declares them.
--
-- invoice_number is UNIQUE (not just NOT NULL): the UI requires an invoice number on
-- every save (components/invoicing/fuel-ticket-sheet.tsx) and specifically pattern-matches
-- a "duplicate ... invoice_number" Postgres error to show "Invoice #X already exists" —
-- that duplicate-detection UX only works if the DB actually enforces uniqueness. NULLs
-- remain unaffected by a plain UNIQUE constraint (Postgres never considers NULL = NULL),
-- which matters because deleteDraftInvoice/voidInvoice set truck_meter_readings.invoice_number
-- back to null on unrelated rows without colliding.

create table invoices (
  id serial primary key,
  invoice_number text not null unique,
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

create index idx_invoices_date         on invoices(invoice_date desc);
create index idx_invoices_status       on invoices(status);
create index idx_invoices_customer     on invoices(customer_id) where customer_id is not null;
create index idx_invoices_tail         on invoices(tail_number) where tail_number is not null;
create index idx_invoice_line_items_invoice on invoice_line_items(invoice_id, line_number);
create index idx_invoice_fuel_readings_line on invoice_fuel_readings(line_item_id);

alter table invoices              enable row level security;
alter table invoice_line_items    enable row level security;
alter table invoice_fuel_readings enable row level security;

create policy "Authenticated users can manage invoices"
  on invoices for all
  using (auth.role() = 'authenticated');

create policy "Authenticated users can manage invoice line items"
  on invoice_line_items for all
  using (auth.role() = 'authenticated');

create policy "Authenticated users can manage invoice fuel readings"
  on invoice_fuel_readings for all
  using (auth.role() = 'authenticated');

grant all on invoices, invoice_line_items, invoice_fuel_readings to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Seed the non-fuel service catalog so the invoicing quick-pick isn't empty on day one.
insert into product (name, description, sku, price, product_type, is_active, created_at, modified_at)
select v.name, v.description, v.sku, v.price, v.product_type, true, now(), now()
from (values
  ('Overnight Parking (Jet)',    'Per night',      'PARK-JET',  150.00, 'fee'),
  ('Overnight Parking (Single)', 'Per night',      'PARK-SGL',   25.00, 'fee'),
  ('GPU Start',                  'Ground power',   'SVC-GPU',    75.00, 'service'),
  ('Lav Service',                '',               'SVC-LAV',   125.00, 'service'),
  ('Potable Water',              '',               'SVC-H2O',    45.00, 'service'),
  ('De-Ice (Type I)',            'Per application','SVC-DEICE', 250.00, 'service'),
  ('Catering Handling',          '',               'FEE-CATER',  50.00, 'fee'),
  ('Ramp Fee',                   'Waived w/ fuel', 'FEE-RAMP',   75.00, 'fee'),
  ('Prist Additive',             'Per treatment',  'PROD-PRIST', 15.00, 'product'),
  ('Oil (Qt)',                   'Aeroshell W100', 'PROD-OIL',   12.50, 'product')
) as v(name, description, sku, price, product_type)
where not exists (select 1 from product p where p.sku = v.sku);
