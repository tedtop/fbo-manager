-- B63a: the edit-concurrency banner ("someone just saved") listens for realtime changes on schedule_shift and
-- training_course. schedule_shift is already in the supabase_realtime publication on live; training_course is not.
-- Guarded so it is a no-op when the table is already published (and on targets without the publication).
-- Rollback: alter publication supabase_realtime drop table public.training_course;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedule_shift'
    ) then
      execute 'alter publication supabase_realtime add table public.schedule_shift';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'training_course'
    ) then
      execute 'alter publication supabase_realtime add table public.training_course';
    end if;
  end if;
end $$;
