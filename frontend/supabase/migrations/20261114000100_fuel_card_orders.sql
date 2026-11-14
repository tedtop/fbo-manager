-- B121 / D25: the board card's Fuel action creates a fuel order (fuel_transaction, source 'flight_card') instead of
-- putting the `fuel` service on the flight, so the `fuel` service is retired from the board vocabulary.
--   * Every existing flight_service 'fuel' row becomes one requested flight_card order for that flight
--     (fuel_request = the row's note, else the flight's fuel_order_notes). Gallons and fuel type were never stored,
--     so they stay empty (the card reads an empty gallons figure as "Top off").
--   * Check: the number of orders created must equal the number of fuel rows found, or the migration raises.
--   * The fuel flight_service rows are then deleted and flight.services (legacy dual-write column) is re-synced for
--     those flights, so no flight keeps an inactive key that would make set_flight_services raise on its next save.
--   * service 'fuel' is set inactive: it leaves the picker (findActiveServices) and the filters.
-- All in one transaction. Depends on 20261113000100_fuel_order_status.sql (status, source 'flight_card' kept).
--
-- Rollback: frontend/supabase/rollbacks/20261114000100_fuel_card_orders.down.sql
-- Live apply WAITS FOR TED (back up flight_service and fuel_transaction first). When he approves, apply ONLY with
-- supabase db query --linked -f <this file> (never `supabase db push`), then
-- supabase migration repair --linked --status applied 20261114000100

begin;

do $$
declare
  v_expected integer;
  v_created  integer;
begin
  select count(*) into v_expected
  from flight_service fs
  join service s on s.id = fs.service_id
  where s.key = 'fuel';

  with ins as (
    insert into fuel_transaction (flight_id, tail_number, source, status, fuel_request)
    select fs.flight_id, f.tail_number, 'flight_card', 'requested',
           coalesce(nullif(btrim(fs.notes), ''), nullif(btrim(f.fuel_order_notes), ''))
    from flight_service fs
    join service s on s.id = fs.service_id
    join flight f on f.id = fs.flight_id
    where s.key = 'fuel'
    returning 1
  )
  select count(*) into v_created from ins;

  if v_created <> v_expected then
    raise exception 'B121: created % flight_card orders for % fuel flight_service rows', v_created, v_expected;
  end if;

  -- Drop the fuel rows and re-sync the legacy flight.services column for the flights that had one.
  create temp table b121_fuel_flights on commit drop as
    select fs.flight_id
    from flight_service fs
    join service s on s.id = fs.service_id
    where s.key = 'fuel';

  delete from flight_service fs
  using service s
  where s.id = fs.service_id and s.key = 'fuel';

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
  where f.id in (select flight_id from b121_fuel_flights);
end $$;

update service set active = false where key = 'fuel';

commit;
