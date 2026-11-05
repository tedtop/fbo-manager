-- hire_date: the day the person started at Minuteman (work anniversary). The Users page "Joined" column shows
-- it, falling back to the sign-up date (created_at) until an admin fills it in. Managed by users-module admins.
-- Touches: profiles (new nullable date column), guard_profile_columns() (hire_date added to the protected columns).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_date date;

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
