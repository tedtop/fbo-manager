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
    NEW.created_by  := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE profiles DROP COLUMN IF EXISTS badge_id;
