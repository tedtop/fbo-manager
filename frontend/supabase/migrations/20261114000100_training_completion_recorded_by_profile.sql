-- B141: attribute a training completion to the signed-in account (profiles) instead of only a legacy `users` row.
-- Touches: training_completion (new nullable uuid column + FK to profiles, on delete set null).
-- recorded_by_id (legacy users link) stays for old rows; new rows fill both when a legacy row exists.
-- No grants (RLS on training_completion is unchanged: authenticated-all).

ALTER TABLE training_completion
  ADD COLUMN IF NOT EXISTS recorded_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
