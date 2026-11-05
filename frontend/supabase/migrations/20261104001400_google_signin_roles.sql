-- Google sign-in + role model for self-service sign-ups.
--
-- New users (Google or email) get a profiles row and NO role. They are held on
-- a /pending page until an admin gives them a role in the Users module.
--
-- Roles after this migration:
--   Administrator    full access (line managers and management)
--   Front Desk       was "Office Staff"
--   Line Department  was "Line Technician"
--   Customer         signs in, no module access yet (customer portal is B25)
--
-- Rollback: frontend/supabase/rollbacks/20261104001400_google_signin_roles.down.sql

-- ============================================================
-- 1. Roles
-- ============================================================
UPDATE roles
SET name = 'Front Desk',
    description = 'Front office: flight operations, invoicing and parking. Read-only fuel farm, equipment and line schedule.'
WHERE name = 'Office Staff'
  AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Front Desk');

UPDATE roles
SET name = 'Line Department',
    description = 'Line crew: equipment, fuel farm and truck sheets. Read-only flight board, parking, training and line schedule.'
WHERE name = 'Line Technician'
  AND NOT EXISTS (SELECT 1 FROM roles WHERE name = 'Line Department');

UPDATE roles
SET description = 'Full access to every module, including user management. For line managers and management.'
WHERE name = 'Administrator';

INSERT INTO roles (name, description, is_system) VALUES
  ('Customer', 'Aircraft owners and operators. Can sign in; no module access until the customer portal exists.', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Management is folded into Administrator. Only removed when nobody holds it.
DELETE FROM roles r
WHERE r.name = 'Management'
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id = r.id);

-- Line crew need to see the board and the ramp map.
INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, m.module, 'view'
FROM roles r
CROSS JOIN (VALUES ('flight_operations'), ('parking')) AS m(module)
WHERE r.name = 'Line Department'
ON CONFLICT (role_id, module) DO NOTHING;

-- Front desk dispatches fuel, so they need to see the fuel farm.
INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, 'fuel_farm', 'view'
FROM roles r
WHERE r.name = 'Front Desk'
ON CONFLICT (role_id, module) DO NOTHING;

-- ============================================================
-- 2. Profile creation: understand Google's user metadata
--    (given_name / family_name / full_name / name) as well as the
--    first_name / last_name the invite flow sets.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meta  jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full  text  := COALESCE(NULLIF(v_meta->>'full_name', ''), NULLIF(v_meta->>'name', ''), '');
  v_first text;
  v_last  text;
BEGIN
  v_first := COALESCE(
    NULLIF(v_meta->>'first_name', ''),
    NULLIF(v_meta->>'given_name', ''),
    NULLIF(split_part(v_full, ' ', 1), ''),
    ''
  );
  v_last := COALESCE(
    NULLIF(v_meta->>'last_name', ''),
    NULLIF(v_meta->>'family_name', ''),
    NULLIF(btrim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), ''),
    ''
  );

  -- Names come from user-controlled metadata: cap them.
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), left(v_first, 100), left(v_last, 100))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2b. A disabled account holds no module access, whatever roles it still has
--     (so a disabled admin cannot manage users or re-enable themselves).
-- ============================================================
CREATE OR REPLACE FUNCTION has_module_access(p_module TEXT, p_min_level TEXT DEFAULT 'view')
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    JOIN public.module_permissions mp ON mp.role_id = ur.role_id
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND mp.module = p_module
      AND (
        p_min_level = 'view'
        OR mp.access_level = 'manage'
      )
  );
$$;

-- ============================================================
-- 3. One-call access snapshot for the signed-in user. Used by the
--    middleware to decide: pending page, disabled, or which modules.
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_access()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'status', COALESCE((SELECT p.status FROM profiles p WHERE p.id = auth.uid()), 'none'),
    'roles', COALESCE((
      SELECT jsonb_agg(r.name ORDER BY r.name)
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
    ), '[]'::jsonb),
    'access', COALESCE((
      SELECT jsonb_object_agg(m.module, m.level)
      FROM (
        SELECT mp.module,
               CASE WHEN bool_or(mp.access_level = 'manage') THEN 'manage' ELSE 'view' END AS level
        FROM user_roles ur JOIN module_permissions mp ON mp.role_id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.status = 'active')
        GROUP BY mp.module
      ) m
    ), '{}'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_access() TO authenticated, service_role;

-- ============================================================
-- 4. Profiles: a signed-in user may edit their own name and phone,
--    but not their own status (a disabled user must not re-enable
--    themselves), email or employee id. Service role / SQL
--    (auth.uid() is null) and users-module managers are unaffected.
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_profiles_guard_columns ON profiles;
CREATE TRIGGER trg_profiles_guard_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_columns();
