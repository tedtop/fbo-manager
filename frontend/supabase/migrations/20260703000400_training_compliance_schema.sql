-- Training / Compliance Tracking
--
-- Data model:
--   users               <- employees live in the existing Django users table
--   department_member   <- active staff roster (which users appear in the matrix)
--   training_course     <- one row per training/certification (a matrix column)
--   training_completion <- append-only log; one row per completion event.
--                          The matrix shows the latest completion per (user, course);
--                          older rows are the renewal history for free.
--
-- Legacy Django tables (training, fueler_training, fueler_training_history,
-- assigned_training) are superseded by this schema and intentionally left
-- untouched — they contain only disposable test data.
--
-- Note: department_member (the active staff roster referenced above and by
-- frontend/repositories/staff.repo.ts) belongs to the line-schedule module's
-- department/department_member/schedule_shift rebuild and is intentionally not
-- defined here — out of scope for this migration.

-- ============================================================
-- 1. TRAINING COURSES: the columns of the compliance matrix.
--    validity_amount/unit define how long a completion is good
--    for (e.g. 12 months). Both NULL = never expires.
-- ============================================================
create table training_course (
  id               bigserial primary key,
  name             text    not null check (length(trim(name)) > 0),
  url              text    not null default '',   -- link to training material / course
  instructions     text    not null default '',   -- free-text instructions
  validity_amount  integer check (validity_amount > 0),
  validity_unit    text    check (validity_unit in ('days', 'weeks', 'months', 'years')),
  display_order    integer not null default 0,
  is_active        boolean not null default true, -- retired courses keep their history
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((validity_amount is null) = (validity_unit is null))
);

create unique index uq_training_course_name on training_course (lower(name));

-- ============================================================
-- 2. TRAINING COMPLETIONS: append-only completion events.
--    expires_on is stamped at write time from the course's
--    validity period (completed_on + validity). It is stored,
--    not derived on read, so that changing a course's validity
--    later never retroactively re-dates certificates that were
--    issued under the old rule.
-- ============================================================
create table training_completion (
  id                bigserial primary key,
  course_id         bigint not null references training_course(id) on delete cascade,
  user_id           bigint not null references users(id) on delete cascade,
  completed_on      date   not null,
  expires_on        date,                -- NULL = never expires
  certificate_path  text,                -- object path in the training-certificates bucket
  certificate_name  text,                -- original uploaded filename
  notes             text   not null default '',
  recorded_by_id    bigint references users(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ============================================================
-- 3. Indexes
-- ============================================================
create index idx_training_completion_user_course
  on training_completion (user_id, course_id, completed_on desc);
create index idx_training_completion_course
  on training_completion (course_id);
create index idx_training_completion_expires
  on training_completion (expires_on) where expires_on is not null;

-- ============================================================
-- 4. RLS (matches house style: authenticated users manage all)
-- ============================================================
alter table training_course     enable row level security;
alter table training_completion enable row level security;

create policy "Authenticated users can manage training courses"
  on training_course for all
  using (auth.role() = 'authenticated');

create policy "Authenticated users can manage training completions"
  on training_completion for all
  using (auth.role() = 'authenticated');

-- ============================================================
-- 5. Storage: private bucket for uploaded certificates.
--    One object per completion record, keyed
--    {user_id}/{course_id}/{timestamp}-{filename}.
--    Files are served to the app via short-lived signed URLs.
--    No-op if the storage schema doesn't exist (e.g. `[storage] enabled = false`
--    in supabase/config.toml for the local test stack).
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('training-certificates', 'training-certificates', false)
    on conflict (id) do nothing;

    execute $policy1$
      create policy "Authenticated users can read training certificates"
        on storage.objects for select
        using (bucket_id = 'training-certificates' and auth.role() = 'authenticated')
    $policy1$;

    execute $policy2$
      create policy "Authenticated users can upload training certificates"
        on storage.objects for insert
        with check (bucket_id = 'training-certificates' and auth.role() = 'authenticated')
    $policy2$;

    execute $policy3$
      create policy "Authenticated users can delete training certificates"
        on storage.objects for delete
        using (bucket_id = 'training-certificates' and auth.role() = 'authenticated')
    $policy3$;
  end if;
end $$;

-- ============================================================
-- 6. Seed the current training list. Airline fueling
--    certifications renew annually; so does the fire
--    extinguisher training. All editable in the UI.
-- ============================================================
insert into training_course (name, url, instructions, validity_amount, validity_unit, display_order)
values
  ('AvFuel',            '', '', 12, 'months', 0),
  ('American',          '', '', 12, 'months', 1),
  ('United',            '', '', 12, 'months', 2),
  ('Envoy',             '', '', 12, 'months', 3),
  ('SkyWest',           '', '', 12, 'months', 4),
  ('Fire Extinguisher', '', '', 12, 'months', 5)
on conflict ((lower(name))) do nothing;

grant all on training_course, training_completion to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
