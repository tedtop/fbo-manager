-- B123 / D24: invoices becomes the charge list (docs/PLAN.md, "Fuel-to-billing and POS design", 4.2 and 4.3).
--   * invoices.invoice_number and customer_name become nullable (the unique constraint on invoice_number already
--     allows several NULLs). A check requires customer_name or tail_number, so a list from a flight with no known
--     customer is valid.
--   * invoices.kind (visit|counter|airline|legacy): every row that exists at migration time becomes 'legacy',
--     new rows default to 'visit'. invoices.void_reason is new.
--   * invoice_line_items gain service_id, source_key (unique per invoice), unit, keyed_in_at/by, keyed_quantity,
--     waived, waiver_reason, waiver_note, difference_resolved_quantity, difference_note and removed_at.
--   * The partial unique index uq_invoice_line_items_fuel_transaction (double-billing guard) is not touched.
-- All in one transaction. No prices or payment columns are added or removed (D20, D23).
--
-- Rollback: frontend/supabase/rollbacks/20261113000300_charge_list_schema.down.sql
-- Live apply WAITS FOR TED (back up invoices and invoice_line_items first) and must land before B124/B125 merge.
-- When he approves, apply ONLY with supabase db query --linked -f <this file> (never `supabase db push`), then
-- supabase migration repair --linked --status applied 20261113000300

begin;

-- 1. invoices
alter table public.invoices
  alter column invoice_number drop not null,
  alter column customer_name drop not null;

alter table public.invoices
  add constraint invoices_customer_or_tail_check
    check (customer_name is not null or tail_number is not null);

-- existing rows pick up 'legacy' from the column default; the default then moves to 'visit' for new rows
alter table public.invoices
  add column kind text not null default 'legacy'
    constraint invoices_kind_check check (kind in ('visit', 'counter', 'airline', 'legacy')),
  add column void_reason text;
alter table public.invoices alter column kind set default 'visit';

-- 2. invoice_line_items
alter table public.invoice_line_items
  add column service_id integer references public.service(id) on delete set null,
  add column source_key text,
  add column unit text,
  add column keyed_in_at timestamptz,
  add column keyed_in_by integer references public.users(id) on delete set null,
  add column keyed_quantity numeric,
  add column waived boolean not null default false,
  add column waiver_reason text
    constraint invoice_line_items_waiver_reason_check
      check (waiver_reason in ('fuel_minimum', 'hangar_lease', 'manual')),
  add column waiver_note text,
  add column difference_resolved_quantity numeric,
  add column difference_note text,
  add column removed_at timestamptz;

create unique index uq_invoice_line_items_source_key
  on public.invoice_line_items (invoice_id, source_key)
  where source_key is not null;

commit;
