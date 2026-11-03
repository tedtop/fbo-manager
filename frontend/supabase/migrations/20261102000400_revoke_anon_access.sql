-- RLS rollout, Phase 1: close the anonymous hole (docs/rls-rollout-plan.md, backlog B29).
--
-- Supabase's default grants gave the logged-out `anon` role (whose key ships in the browser
-- bundle) every privilege on every public table, function and sequence. This app requires login
-- before showing anything, and the login / invite flows use Supabase Auth endpoints, not tables;
-- the Minuteman app connects only with service_role. Nothing legitimate needs anon table access.
--
-- Does NOT touch service_role (bypasses grants/RLS; Minuteman depends on it) or any row data.
-- Does NOT enable RLS on any table (Phase 2). authenticated keeps its normal rights, minus the
-- DDL-ish ones (TRUNCATE, TRIGGER, REFERENCES) that the browser never needs.
--
-- Rollback (per table, only if something legitimate broke):
--   grant select, insert, update, delete on public.<table> to anon;
-- The before-state is recorded in docs/archive/rls-before-snapshot-2026-11-02.json.
--
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`).

begin;

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Functions are executable by PUBLIC by default, so anon inherits access unless PUBLIC is revoked
-- too. authenticated and service_role get explicit grants back (policies call has_module_access()
-- and can_manage_users() as the logged-in user; Minuteman calls its RPCs as service_role).
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Same defaults for objects created by future migrations (run as postgres).
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

revoke truncate, trigger, references on all tables in schema public from authenticated;

commit;
