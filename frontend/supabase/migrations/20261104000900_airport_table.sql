-- B49 airport lookup: reference table of airports (OurAirports, public domain), seeded by
-- 20261104001000_airport_seed.sql. Powers the shared airport combobox: pilots type IATA (MSO), FAA
-- identifier or ICAO (KMSO) or a name/city, the app stores the ICAO in flight.origin/destination and
-- shows the code each FBO prefers (setting airport_display).
--
-- Reference data: signed-in users can read it, nobody can write through the API (the seed migration and
-- service_role maintain it). anon gets nothing (docs/rls-rollout-plan.md).
--
-- Codes are stored upper case and queried upper case, so plain btree indexes serve the code lookups. No
-- index on name/city: the table is ~32k rows and the picker's ilike '%x%' scan takes a few ms; a trigram
-- index would need an extension for no visible gain.
--
-- Idempotent. Rollback: frontend/supabase/rollbacks/20261104000900_airport_table.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file> (never `supabase db push`), then
-- supabase migration repair --linked --status applied 20261104000900

begin;

create table if not exists public.airport (
  id                bigint generated always as identity primary key,
  ident             text not null unique,
  icao              text,
  iata              text,
  faa               text,
  name              text not null,
  city              text,
  region            text,
  country           text not null,
  type              text,
  latitude          double precision,
  longitude         double precision,
  scheduled_service boolean default false,
  created_at        timestamptz not null default now(),
  modified_at       timestamptz not null default now()
);

comment on table public.airport is 'Airport reference data (OurAirports). Read-only for the app.';
comment on column public.airport.ident is 'OurAirports identifier (unique); ICAO for most, FAA/local code or a made-up id for small strips.';
comment on column public.airport.icao is 'Canonical stored code: 4-letter ICAO, or null for strips that only have a FAA/local code.';
comment on column public.airport.faa is 'FAA identifier (US only, local_code), e.g. MSO, GPI, 3U7.';
comment on column public.airport.iata is 'IATA code, e.g. MSO. Not unique across the world (GPI is Glacier Park and Guapi).';
comment on column public.airport.region is 'ISO 3166-2 region, e.g. US-MT.';

create index if not exists airport_icao_idx    on public.airport (icao);
create index if not exists airport_iata_idx    on public.airport (iata);
create index if not exists airport_faa_idx     on public.airport (faa);
create index if not exists airport_country_idx on public.airport (country);

drop trigger if exists trg_airport_set_modified_at on public.airport;
create trigger trg_airport_set_modified_at
  before update on public.airport
  for each row execute function set_modified_at();

alter table public.airport enable row level security;

drop policy if exists "airport_select_authenticated" on public.airport;
create policy "airport_select_authenticated" on public.airport for select to authenticated using (true);

revoke all on public.airport from public, anon, authenticated, service_role;
grant select on public.airport to authenticated;
grant all on public.airport to service_role;
grant usage, select on sequence public.airport_id_seq to service_role;

commit;
