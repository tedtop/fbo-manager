-- Test-schema mirror of frontend/scripts/fuel-invoicing-workflow-schema.sql
-- (dispatch ↔ truck-sheet ↔ invoicing linkage). Keep the two in sync — the
-- repository integration tests exist to catch drift between the repos,
-- frontend/types/database.ts, and this schema.
--
-- Differences from the production script (consistent with the other test
-- migrations): serial int PKs, no RLS/policies, no COMMENTs, no backfill
-- (the test DB starts empty).

-- 1. fuel_transaction dispatch-time fields
alter table fuel_transaction rename column fuel_order_text to fuel_request;
alter table fuel_transaction
  add column gallons_requested numeric,
  add column gallons_delivered numeric,
  add column customer_name text;

-- 2. scan-reconciliation link (async, nullable, intentionally non-unique:
--    one fueling can span front+rear register rows)
alter table truck_meter_readings
  add column fuel_transaction_id integer references fuel_transaction(id) on delete set null;

-- 3. per-tank before/after readings (airline fuelings; free-form position)
create table fuel_transaction_tank_readings (
  id serial primary key,
  fuel_transaction_id integer not null references fuel_transaction(id) on delete cascade,
  tank_position text not null check (tank_position <> ''),
  reading_before numeric,
  reading_after numeric,
  reading_unit text not null default 'lbs' check (reading_unit in ('lbs','gal','kg')),
  created_at timestamptz not null default now(),
  unique (fuel_transaction_id, tank_position)
);

-- 4. billing link: a fuel_transaction is billed at most once
alter table invoice_line_items
  add column fuel_transaction_id integer references fuel_transaction(id) on delete restrict;

create unique index uq_invoice_line_items_fuel_transaction
  on invoice_line_items(fuel_transaction_id)
  where fuel_transaction_id is not null;

-- 5. invoice-number regimes + paper-book pickup state
alter table invoices
  add column number_source text not null default 'live' check (number_source in ('live','paper_book')),
  add column accounting_picked_up_at timestamptz;

-- 6. scanned document originals (both paper document types)
create table scanned_documents (
  id serial primary key,
  doc_type text not null check (doc_type in ('truck_sheet','invoice_slip')),
  storage_bucket text not null default 'scans',
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null,
  byte_size bigint,
  page_number integer,
  truck_sheet_id integer references truck_sheets(id) on delete set null,
  invoice_id integer references invoices(id) on delete set null,
  uploaded_by uuid,
  notes text,
  created_at timestamptz not null default now()
);

-- private bucket for scan uploads. Guarded: only when the storage service is
-- enabled (supabase/config.toml [storage]) — the storage schema doesn't exist
-- otherwise and plain-Postgres CI targets shouldn't fail on it.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('scans', 'scans', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- 7. per-truck running fuel level, derived vs. as-written
create or replace view truck_sheet_running_totals as
select
  r.id                as reading_id,
  r.truck_sheet_id,
  s.sheet_date,
  s.truck_number,
  r.line_number,
  r.reading_type,
  r.gallons_pumped,
  r.gallons_remaining as gallons_remaining_written,
  s.starting_gallons
    + sum(
        case
          when r.reading_type in ('tank_fill', 'transfer_in') then coalesce(r.gallons_pumped, 0)
          else -coalesce(r.gallons_pumped, 0)
        end
      ) over (
        partition by r.truck_sheet_id
        order by r.line_number
        rows between unbounded preceding and current row
      )               as gallons_remaining_computed
from truck_meter_readings r
join truck_sheets s on s.id = r.truck_sheet_id;

grant all on fuel_transaction_tank_readings, scanned_documents to anon, authenticated, service_role;
grant select on truck_sheet_running_totals to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
