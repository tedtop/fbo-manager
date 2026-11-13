-- Rollback for 20261113000100_profile_initials_fueler_user.sql.
-- Also remove the version from the migration history if it was recorded:
--   supabase migration repair --linked --yes --status reverted 20261113000100
CREATE OR REPLACE FUNCTION guard_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT can_manage_users() THEN
    NEW.status      := OLD.status;
    NEW.email       := OLD.email;
    NEW.employee_id := OLD.employee_id;
    NEW.badge_id    := OLD.badge_id;
    NEW.hire_date   := OLD.hire_date;
    NEW.created_by  := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP INDEX IF EXISTS idx_truck_sheets_fueler_user;
ALTER TABLE truck_sheets DROP COLUMN IF EXISTS fueler_user_id;
DROP INDEX IF EXISTS uq_profiles_initials_active;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_initials_format;
ALTER TABLE profiles DROP COLUMN IF EXISTS initials;
