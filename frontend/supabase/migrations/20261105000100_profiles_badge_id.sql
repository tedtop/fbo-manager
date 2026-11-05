-- Badge ID: the small number printed on the back of the airport ID badge. The airport needs it from the
-- line manager once a year, so it is stored next to the employee ID. Managed by users-module admins only.
-- Touches: profiles (new nullable column), guard_profile_columns() (badge_id added to the protected columns).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_id text;

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
    NEW.created_by  := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;
