-- Rollback for 20261114000200_fuel_card_orders.sql (B121): reactivates the `fuel` service and puts it back on every
-- flight that has an open (requested, assigned or fueling) flight_card order, then re-syncs flight.services.
-- The orders themselves are kept (they are real fuel records, possibly already filled and invoiced); cancel or delete
-- them by hand if they should go. Gallons, fuel type, Prist and time wanted on the orders are not carried to the service.
-- Apply with: supabase db query --linked --yes -f <this file>, then
-- supabase migration repair --linked --yes --status reverted 20261114000200
begin;

update service set active = true where key = 'fuel';

insert into flight_service (flight_id, service_id)
select distinct t.flight_id, s.id
from fuel_transaction t
join service s on s.key = 'fuel'
where t.source = 'flight_card'
  and t.status in ('requested', 'assigned', 'fueling')
  and t.flight_id is not null
on conflict (flight_id, service_id) do nothing;

update flight f
set services = (jsonb_populate_record(
      null::flight,
      jsonb_build_object('services', to_jsonb(coalesce(
        (select array_agg(s.key order by s.sort_order, s.key)
           from flight_service fs
           join service s on s.id = fs.service_id
          where fs.flight_id = f.id),
        '{}'::text[])))
    )).services
where f.id in (
  select t.flight_id from fuel_transaction t
  where t.source = 'flight_card' and t.status in ('requested', 'assigned', 'fueling') and t.flight_id is not null
);

commit;
