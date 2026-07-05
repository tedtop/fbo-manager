-- User Management: profiles, roles, per-module permissions
-- These tables are Supabase-native (not Django-managed).
--
-- Data model:
--   profiles           <- one row per Supabase auth user (extends auth.users)
--   roles              <- named roles, e.g. Administrator, Line Technician
--   module_permissions <- per-role, per-module access level (view | manage)
--   user_roles         <- many-to-many: which roles a profile holds
--
-- Access model:
--   Every operational module (equipment, invoicing, training, parking,
--   flight_operations, line_schedule, truck_sheets, fuel_farm) plus the
--   'users' module itself is gated independently. A role grants either
--   'view' (read-only) or 'manage' (full read/write) access per module;
--   no row for a module means no access. A profile can hold multiple
--   roles; access is the union (most-permissive) across all of them.
--
-- This improves on the house "any authenticated user can do anything"
-- policy (see truck-sheets-schema.sql) by checking actual role grants
-- via the has_module_access() helper below instead of auth.role().

-- ============================================================
-- 1. ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE, -- seeded roles; cannot be deleted
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. MODULE PERMISSIONS: per-role access level per app module
-- ============================================================
CREATE TABLE IF NOT EXISTS module_permissions (
  id            BIGSERIAL PRIMARY KEY,
  role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module        TEXT   NOT NULL CHECK (module IN (
    'equipment', 'invoicing', 'training', 'parking',
    'flight_operations', 'line_schedule', 'truck_sheets',
    'fuel_farm', 'users'
  )),
  access_level  TEXT   NOT NULL CHECK (access_level IN ('view', 'manage')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, module)
);

-- ============================================================
-- 3. PROFILES: extends auth.users with app-facing directory data
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  phone_number  TEXT NOT NULL DEFAULT '',
  employee_id   TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================
-- 4. USER ROLES: many-to-many, a profile can hold several roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID   NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, role_id)
);

-- ============================================================
-- 5. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_module_permissions_role   ON module_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user            ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role            ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status            ON profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_email             ON profiles(email);

-- ============================================================
-- 6. updated_at maintenance
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 7. Auto-create a profile row whenever a Supabase auth user is
--    created (self-registration via /register, or an admin invite
--    via supabase.auth.admin.inviteUserByEmail).
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- 8. Permission helper: does the current user hold at least
--    p_min_level access on p_module, via any of their roles?
--    'manage' implies 'view'. SECURITY DEFINER so it can read
--    user_roles/module_permissions regardless of the caller's
--    own row-level access to those tables.
-- ============================================================
CREATE OR REPLACE FUNCTION has_module_access(p_module TEXT, p_min_level TEXT DEFAULT 'view')
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN module_permissions mp ON mp.role_id = ur.role_id
    WHERE ur.user_id = auth.uid()
      AND mp.module = p_module
      AND (
        p_min_level = 'view'
        OR mp.access_level = 'manage'
      )
  );
$$;

-- Convenience wrapper used throughout the RLS policies below.
CREATE OR REPLACE FUNCTION can_manage_users()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT has_module_access('users', 'manage');
$$;

-- ============================================================
-- 9. RLS
-- ============================================================
ALTER TABLE roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;

-- Roles & module_permissions: any authenticated user may read them
-- (the client needs this to resolve its own effective permissions);
-- only users-module managers may write.
CREATE POLICY "Authenticated users can view roles"
  ON roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users admins can manage roles"
  ON roles FOR INSERT WITH CHECK (can_manage_users());
CREATE POLICY "Users admins can update roles"
  ON roles FOR UPDATE USING (can_manage_users());
CREATE POLICY "Users admins can delete non-system roles"
  ON roles FOR DELETE USING (can_manage_users() AND NOT is_system);

CREATE POLICY "Authenticated users can view module permissions"
  ON module_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users admins can manage module permissions"
  ON module_permissions FOR INSERT WITH CHECK (can_manage_users());
CREATE POLICY "Users admins can update module permissions"
  ON module_permissions FOR UPDATE USING (can_manage_users());
CREATE POLICY "Users admins can delete module permissions"
  ON module_permissions FOR DELETE USING (can_manage_users());

-- Profiles: everyone can see the directory (needed for staff pickers
-- across other modules, e.g. assigning a line tech); a user can always
-- edit their own row; only users-module managers can edit others or
-- delete accounts. Row inserts happen via the auth trigger (or the
-- service-role invite route), never directly from a client.
CREATE POLICY "Authenticated users can view profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id OR can_manage_users());

CREATE POLICY "Users admins can delete profiles"
  ON profiles FOR DELETE
  USING (can_manage_users());

-- User roles: a user can see their own role assignments (to resolve
-- their own permissions); users-module managers can see and manage
-- everyone's.
CREATE POLICY "Users can view their own role assignments"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id OR can_manage_users());

CREATE POLICY "Users admins can assign roles"
  ON user_roles FOR INSERT WITH CHECK (can_manage_users());
CREATE POLICY "Users admins can update role assignments"
  ON user_roles FOR UPDATE USING (can_manage_users());
CREATE POLICY "Users admins can remove role assignments"
  ON user_roles FOR DELETE USING (can_manage_users());

-- ============================================================
-- 10. Seed default roles + a sensible starting permission matrix
-- ============================================================
INSERT INTO roles (name, description, is_system) VALUES
  ('Administrator',   'Full access to every module, including user management.', TRUE),
  ('Management',      'View across all operations, manage staffing-facing modules.', TRUE),
  ('Office Staff',    'Manage front-office modules: invoicing, parking, flight ops.', TRUE),
  ('Line Technician',  'Line-facing modules only: equipment, fuel farm, truck sheets, training.', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, m.module, 'manage'
FROM roles r
CROSS JOIN (VALUES
  ('equipment'), ('invoicing'), ('training'), ('parking'),
  ('flight_operations'), ('line_schedule'), ('truck_sheets'),
  ('fuel_farm'), ('users')
) AS m(module)
WHERE r.name = 'Administrator'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.level
FROM roles r
CROSS JOIN (VALUES
  ('equipment', 'view'), ('invoicing', 'view'), ('training', 'view'),
  ('parking', 'view'), ('flight_operations', 'view'),
  ('line_schedule', 'manage'), ('truck_sheets', 'view'),
  ('fuel_farm', 'view'), ('users', 'view')
) AS m(module, level)
WHERE r.name = 'Management'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.level
FROM roles r
CROSS JOIN (VALUES
  ('invoicing', 'manage'), ('parking', 'manage'),
  ('flight_operations', 'manage'), ('line_schedule', 'view'),
  ('equipment', 'view')
) AS m(module, level)
WHERE r.name = 'Office Staff'
ON CONFLICT (role_id, module) DO NOTHING;

INSERT INTO module_permissions (role_id, module, access_level)
SELECT r.id, m.module, m.level
FROM roles r
CROSS JOIN (VALUES
  ('equipment', 'manage'), ('fuel_farm', 'manage'),
  ('truck_sheets', 'manage'), ('training', 'view'),
  ('line_schedule', 'view')
) AS m(module, level)
WHERE r.name = 'Line Technician'
ON CONFLICT (role_id, module) DO NOTHING;

-- ============================================================
-- 11. Backfill: create a profile for any auth user that predates
--     this migration (the trigger only fires on new signups).
-- ============================================================
INSERT INTO profiles (id, email)
SELECT u.id, u.email
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 12. Bootstrap: granting the Administrator role to a specific real
--     account requires a real email address and is a one-time,
--     per-environment decision — not something to automate in a
--     migration. See frontend/scripts/bootstrap-admin-role.sql.
-- ============================================================
