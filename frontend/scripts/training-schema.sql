-- Training / Compliance Tracking
-- Run this in the Supabase SQL Editor (supabase.com/dashboard → SQL Editor).
-- These tables are Supabase-native (not Django-managed).
--
-- Data model:
--   users               ← employees live in the existing Django users table
--   department_member   ← active staff roster (which users appear in the matrix)
--   training_course     ← one row per training/certification (a matrix column)
--   training_completion ← append-only log; one row per completion event.
--                         The matrix shows the latest completion per (user, course);
--                         older rows are the renewal history for free.
--
-- Legacy Django tables (training, fueler_training, fueler_training_history,
-- assigned_training) are superseded by this schema and intentionally left
-- untouched — they contain only disposable test data.

-- ============================================================
-- 1. TRAINING COURSES: the columns of the compliance matrix.
--    validity_amount/unit define how long a completion is good
--    for (e.g. 12 months). Both NULL = never expires.
-- ============================================================
CREATE TABLE IF NOT EXISTS training_course (
  id               BIGSERIAL PRIMARY KEY,
  name             TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  url              TEXT    NOT NULL DEFAULT '',   -- link to training material / course
  instructions     TEXT    NOT NULL DEFAULT '',   -- free-text instructions
  validity_amount  INTEGER CHECK (validity_amount > 0),
  validity_unit    TEXT    CHECK (validity_unit IN ('days', 'weeks', 'months', 'years')),
  display_order    INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE, -- retired courses keep their history
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((validity_amount IS NULL) = (validity_unit IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_course_name
  ON training_course (lower(name));

-- ============================================================
-- 2. TRAINING COMPLETIONS: append-only completion events.
--    expires_on is stamped at write time from the course's
--    validity period (completed_on + validity). It is stored,
--    not derived on read, so that changing a course's validity
--    later never retroactively re-dates certificates that were
--    issued under the old rule.
-- ============================================================
CREATE TABLE IF NOT EXISTS training_completion (
  id                BIGSERIAL PRIMARY KEY,
  course_id         BIGINT NOT NULL REFERENCES training_course(id) ON DELETE CASCADE,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_on      DATE   NOT NULL,
  expires_on        DATE,                -- NULL = never expires
  certificate_path  TEXT,                -- object path in the training-certificates bucket
  certificate_name  TEXT,                -- original uploaded filename
  notes             TEXT   NOT NULL DEFAULT '',
  recorded_by_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_training_completion_user_course
  ON training_completion (user_id, course_id, completed_on DESC);
CREATE INDEX IF NOT EXISTS idx_training_completion_course
  ON training_completion (course_id);
CREATE INDEX IF NOT EXISTS idx_training_completion_expires
  ON training_completion (expires_on) WHERE expires_on IS NOT NULL;

-- ============================================================
-- 4. RLS (matches house style: authenticated users manage all)
-- ============================================================
ALTER TABLE training_course     ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_completion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage training courses" ON training_course;
CREATE POLICY "Authenticated users can manage training courses"
  ON training_course FOR ALL
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can manage training completions" ON training_completion;
CREATE POLICY "Authenticated users can manage training completions"
  ON training_completion FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 5. Storage: private bucket for uploaded certificates.
--    One object per completion record, keyed
--    {user_id}/{course_id}/{timestamp}-{filename}.
--    Files are served to the app via short-lived signed URLs.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-certificates', 'training-certificates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can read training certificates" ON storage.objects;
CREATE POLICY "Authenticated users can read training certificates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'training-certificates' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can upload training certificates" ON storage.objects;
CREATE POLICY "Authenticated users can upload training certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'training-certificates' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete training certificates" ON storage.objects;
CREATE POLICY "Authenticated users can delete training certificates"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'training-certificates' AND auth.role() = 'authenticated');

-- ============================================================
-- 6. Seed the current training list. Airline fueling
--    certifications renew annually; so does the fire
--    extinguisher training. All editable in the UI.
-- ============================================================
INSERT INTO training_course (name, url, instructions, validity_amount, validity_unit, display_order)
VALUES
  ('AvFuel',            '', '', 12, 'months', 0),
  ('American',          '', '', 12, 'months', 1),
  ('United',            '', '', 12, 'months', 2),
  ('Envoy',             '', '', 12, 'months', 3),
  ('SkyWest',           '', '', 12, 'months', 4),
  ('Fire Extinguisher', '', '', 12, 'months', 5)
ON CONFLICT ((lower(name))) DO NOTHING;
