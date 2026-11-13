-- Rollback for 20261113000300_charge_list_schema.sql: drops the charge-list columns and restores NOT NULL on
-- invoices.invoice_number and customer_name.
-- Lossy by design: kind, void_reason and all keying / waiver / difference data are dropped. Rows with a NULL
-- invoice_number or customer_name (created after the migration) would block the NOT NULL restore, so this file
-- first fills them: invoice_number gets 'UNNUMBERED-<id>' and customer_name gets the tail number, else 'Unknown'.
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261113000300
begin;

drop index if exists public.uq_invoice_line_items_source_key;
alter table public.invoice_line_items
  drop column if exists service_id,
  drop column if exists source_key,
  drop column if exists unit,
  drop column if exists keyed_in_at,
  drop column if exists keyed_in_by,
  drop column if exists keyed_quantity,
  drop column if exists waived,
  drop column if exists waiver_reason,
  drop column if exists waiver_note,
  drop column if exists difference_resolved_quantity,
  drop column if exists difference_note,
  drop column if exists removed_at;

alter table public.invoices drop constraint if exists invoices_customer_or_tail_check;
alter table public.invoices
  drop column if exists kind,
  drop column if exists void_reason;

update public.invoices set invoice_number = 'UNNUMBERED-' || id where invoice_number is null;
update public.invoices set customer_name = coalesce(tail_number, 'Unknown') where customer_name is null;
alter table public.invoices
  alter column invoice_number set not null,
  alter column customer_name set not null;

commit;
