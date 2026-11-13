-- B68: fuelers are Line Department users, identified on the truck sheet by their initials.
-- profiles.initials: 1-4 uppercase letters, unique among ACTIVE users only (a former employee's initials can be
--   reused, e.g. two TTs over the years). Managed by users-module admins (added to the protected columns).
-- truck_sheets.fueler_user_id: the user the scanned initials were resolved to, frozen at scan/save time so old
--   sheets stay unambiguous even if initials are later reused. fueler_initials (as scanned) is kept untouched.
-- Touches: profiles (initials, partial unique index, check), truck_sheets (fueler_user_id), guard_profile_columns().
-- Does not touch fueler, fueler_assignment or certification tables (B122 / later slice).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS initials text;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_initials_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_initials_format CHECK (initials IS NULL OR initials ~ '^[A-Z]{1,4}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_initials_active
  ON profiles (initials)
  WHERE initials IS NOT NULL AND status = 'active';

ALTER TABLE truck_sheets
  ADD COLUMN IF NOT EXISTS fueler_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_truck_sheets_fueler_user ON truck_sheets (fueler_user_id);

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
    NEW.initials    := OLD.initials;
    NEW.created_by  := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;
