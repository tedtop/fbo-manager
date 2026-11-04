-- B26f: services that carry a quantity (TKS fluid, sold per gallon) + the tks_fluid board service.
--
-- service.quantity_unit: NULL = a plain toggle with no quantity; a unit ('gal') = the picker asks for
-- flight_service.quantity (already integer > 0, default 1) and shows it next to the pill.
-- set_flight_services() already accepts {key, quantity} objects and keeps an existing quantity when a
-- plain key string is passed, so it is NOT redefined here. No product link and no price (service.product_id
-- stays NULL; billing lives in `product`, docs/PLAN.md B26 addendum).
--
-- Touches: service only. Idempotent (add column if not exists, ON CONFLICT DO NOTHING), one transaction.
-- Apply to live ONLY with: supabase db query --linked --yes -f <this file>  (never `db push`), then
--   supabase migration repair --linked --yes --status applied 20261104001300
-- Rollback: supabase/rollbacks/20261104001300_service_tks_fluid_quantity.down.sql

begin;

alter table service add column if not exists quantity_unit text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'service_quantity_unit_check') then
    alter table service add constraint service_quantity_unit_check
      check (quantity_unit is null or length(btrim(quantity_unit)) > 0);
  end if;
end
$$;

insert into service (key, label, icon, color, sort_order, quantity_unit) values
  ('tks_fluid', 'TKS Fluid', 'droplets', 'lime', 160, 'gal')
on conflict (key) do nothing;

commit;
