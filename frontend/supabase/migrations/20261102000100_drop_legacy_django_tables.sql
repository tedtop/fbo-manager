-- Drop the Django-era tables that the new frontend does not use (owner-approved 2026-11-02).
-- Touches ONLY: auth_group, auth_group_permissions, auth_permission, django_admin_log,
-- django_content_type, django_migrations, django_session, plus the two FK constraints that
-- users_groups and users_user_permissions hold into auth_group / auth_permission (those two
-- tables themselves are kept). No CASCADE: if anything else depends on these, this fails.
-- Does not touch fuel_*, tank_*, or any other live-application table.
-- Safe on a fresh local stack: every statement is IF EXISTS.

begin;

alter table if exists users_groups drop constraint if exists users_groups_group_id_2f3517aa_fk_auth_group_id;
alter table if exists users_user_permissions drop constraint if exists users_user_permissio_permission_id_6d08dcd2_fk_auth_perm;

drop table if exists django_admin_log;
drop table if exists auth_group_permissions;
drop table if exists auth_permission;
drop table if exists auth_group;
drop table if exists django_content_type;
drop table if exists django_session;
drop table if exists django_migrations;

commit;
