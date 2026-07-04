-- Test-schema mirror of frontend/scripts/time-card-schema.sql (time card
-- scan storage + linkage scaffolding). Keep the two in sync.
--
-- Differences from the production script (consistent with the other test
-- migrations): serial int PK, no RLS/policies, no COMMENTs, guarded
-- storage.buckets insert (skipped when the storage schema isn't present,
-- e.g. plain-Postgres CI targets).
--
-- No OCR/extraction logic here or in the production script -- pending real
-- physical time card samples from Ted. This only gives scans somewhere to
-- land and a way to link them to a department_member + pay period.

create table time_card_scan (
  id serial primary key,
  department_member_id integer references department_member(id) on delete set null,
  pay_period_start date,
  pay_period_end date,
  storage_bucket text not null default 'scans',
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null,
  byte_size bigint,
  page_number integer,
  uploaded_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  check (pay_period_end is null or pay_period_start is null or pay_period_end >= pay_period_start)
);

-- private bucket for scan uploads (shared with PR #31's scanned_documents,
-- by id, whether or not that PR has merged yet). Guarded: only when the
-- storage service is enabled -- the storage schema doesn't exist otherwise
-- and plain-Postgres CI targets shouldn't fail on it.
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

grant all on time_card_scan to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
