-- Test-schema mirror of frontend/scripts/error-logging-schema.sql.
-- General-purpose observability table — not specific to invoicing. See that
-- file for the full rationale (Docker-on-VPS deployment has no log
-- aggregation; container stdout isn't queryable after the fact).

create table app_error_log (
  id serial primary key,
  occurred_at timestamptz not null default now(),
  category text not null,
  error_code text not null,
  message text not null,
  detail text,
  context jsonb,
  user_id uuid,
  source text,
  created_at timestamptz not null default now()
);

grant all on app_error_log to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
