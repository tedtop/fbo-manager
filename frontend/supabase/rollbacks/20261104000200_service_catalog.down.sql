-- Rollback for 20261104000200_service_catalog.sql (B26a).
-- flight.services is never modified by the up migration's backfill, and set_flight_services keeps
-- it in sync, so dropping the new objects loses no board data. Destroys flight_service rows
-- (quantity / notes / price_override) and any edits made to the service catalog.
-- Also remove the version from the migration history if it was recorded:
--   supabase migration repair --linked --yes --status reverted 20261104000200

begin;
drop function if exists set_flight_services(bigint, jsonb);
drop table if exists flight_service;
drop table if exists service;
commit;
