-- Training / Compliance schema, materialized as a migration.
--
-- Same situation as 20260704000100_modified_at_triggers.sql: this schema shipped as a
-- manually-run script (frontend/scripts/training-schema.sql, applied via the Supabase
-- SQL Editor against the live project) and was never added to the migration chain, so
-- stacks built from supabase/migrations had no training_course / training_completion
-- tables at all — the whole Training & Compliance module errored on a fresh local
-- stack. Content mirrors the script; the storage-bucket section is guarded so it also
-- applies cleanly where the storage schema isn't provisioned (plain Postgres in CI).
-- Everything is idempotent, so it is safe on a database where the script already ran.

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

CREATE INDEX IF NOT EXISTS idx_training_completion_user_course
  ON training_completion (user_id, course_id, completed_on DESC);
CREATE INDEX IF NOT EXISTS idx_training_completion_course
  ON training_completion (course_id);
CREATE INDEX IF NOT EXISTS idx_training_completion_expires
  ON training_completion (expires_on) WHERE expires_on IS NOT NULL;

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

-- Storage bucket + policies for uploaded certificates — only where the storage schema
-- exists (the local CLI stack provisions it even with the storage service disabled;
-- plain Postgres in CI does not).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
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
  END IF;
END $$;

-- Seed the current training list (idempotent; all editable in the UI).
INSERT INTO training_course (name, url, instructions, validity_amount, validity_unit, display_order)
VALUES
  ('AvFuel',            '', '', 12, 'months', 0),
  ('American',          '', '', 12, 'months', 1),
  ('United',            '', '', 12, 'months', 2),
  ('Envoy',             '', '', 12, 'months', 3),
  ('SkyWest',           '', '', 12, 'months', 4),
  ('Fire Extinguisher', '', '', 12, 'months', 5)
ON CONFLICT ((lower(name))) DO NOTHING;
