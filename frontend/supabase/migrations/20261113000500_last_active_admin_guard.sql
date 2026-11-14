-- B96: the last active Administrator cannot be demoted, deactivated or deleted by any path.
-- Until now only the app (lib/user-guards.ts) enforced this. Mechanism:
--   1. An immediate BEFORE row trigger sees the change while the OLD state is intact and, when OLD was an
--      active Administrator, flags the transaction (a transaction-local setting).
--   2. A DEFERRABLE INITIALLY DEFERRED constraint trigger runs at commit: if the transaction was flagged
--      and no active Administrator is left, it raises SQLSTATE FBA01.
-- Checking at commit (not per row) means a transaction that removes the role and adds it back, or demotes one
-- admin while promoting another, is fine. Inserts are never checked, so bootstrapping the first admin works.
-- Deleting an auth user cascades to profiles and user_roles; the profiles trigger covers that path.

CREATE OR REPLACE FUNCTION public.is_active_administrator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id
    JOIN roles r ON r.id = ur.role_id
    WHERE p.id = p_user_id AND p.status = 'active' AND r.name = 'Administrator'
  );
$$;

CREATE OR REPLACE FUNCTION public.flag_admin_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  was_admin boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' THEN
    -- Only losing the Administrator role matters; the profile must be active for it to count.
    was_admin := EXISTS (
      SELECT 1 FROM roles r WHERE r.id = OLD.role_id AND r.name = 'Administrator'
    ) AND EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = OLD.user_id AND p.status = 'active'
    );
  ELSIF TG_OP = 'DELETE' OR NEW.status IS DISTINCT FROM 'active' THEN
    was_admin := OLD.status = 'active' AND public.is_active_administrator(OLD.id);
  END IF;

  IF was_admin THEN
    PERFORM set_config('fbo.admin_guard', 'on', true);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_last_active_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('fbo.admin_guard', true), '') = 'on'
     AND NOT EXISTS (
       SELECT 1
       FROM profiles p
       JOIN user_roles ur ON ur.user_id = p.id
       JOIN roles r ON r.id = ur.role_id
       WHERE p.status = 'active' AND r.name = 'Administrator'
     ) THEN
    RAISE EXCEPTION 'At least one active Administrator is required: the last active Administrator cannot be demoted, deactivated or deleted.'
      USING ERRCODE = 'FBA01';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.is_active_administrator(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_admin_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_last_active_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_roles_flag_admin ON user_roles;
CREATE TRIGGER trg_user_roles_flag_admin
  BEFORE UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION public.flag_admin_change();

DROP TRIGGER IF EXISTS trg_user_roles_last_admin ON user_roles;
CREATE CONSTRAINT TRIGGER trg_user_roles_last_admin
  AFTER UPDATE OR DELETE ON user_roles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_active_admin();

DROP TRIGGER IF EXISTS trg_profiles_flag_admin ON profiles;
CREATE TRIGGER trg_profiles_flag_admin
  BEFORE UPDATE OF status OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.flag_admin_change();

DROP TRIGGER IF EXISTS trg_profiles_last_admin ON profiles;
CREATE CONSTRAINT TRIGGER trg_profiles_last_admin
  AFTER UPDATE OF status OR DELETE ON profiles
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.enforce_last_active_admin();
