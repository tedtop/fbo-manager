-- MANUAL, ONE-TIME SCRIPT — not a schema migration, do not add to
-- frontend/supabase/migrations/ and do not run automatically.
--
-- Schema for this project lives entirely in frontend/supabase/migrations/,
-- applied via `pnpm supabase:reset` (local) or `supabase db push` (staging/prod).
-- This script is the one thing that genuinely can't be a migration: granting
-- the Administrator role to a specific real person's account requires a real
-- email address, decided by a human, once, per environment — not something to
-- bake into repeatable schema history.
--
-- Usage: after the user-management migration has run and you've signed up /
-- been invited (so a `profiles` row exists for your account), replace the
-- email below and run this against the target database (Supabase SQL Editor,
-- or `psql`) so you're not locked out of /users.

INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT p.id, r.id, p.id
FROM profiles p, roles r
WHERE p.email = 'you@example.com' AND r.name = 'Administrator'
ON CONFLICT (user_id, role_id) DO NOTHING;
