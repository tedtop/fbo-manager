-- Owner-approved 2026-11-02: drop unused terminal_gate and the empty Django leftovers.
-- Touches ONLY: terminal_gate, users_groups, users_user_permissions, api_employeeshift.
-- No CASCADE: fails if anything still depends on them. Does not touch fueler, fuel_*, tank_*,
-- users, roles, user_roles or module_permissions. IF EXISTS so a fresh local stack also passes.

begin;
drop table if exists terminal_gate;
drop table if exists users_groups;
drop table if exists users_user_permissions;
drop table if exists api_employeeshift;
commit;
