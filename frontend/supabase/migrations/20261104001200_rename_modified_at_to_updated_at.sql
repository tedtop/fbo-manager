-- One name for the "last changed" column: modified_at becomes updated_at on every public table that has it
-- (Ted, 2026-11-04). Plan and reasoning: docs/updated-at-rename-plan.md.
--
-- RUN LAST, together with the deploy of the code that reads updated_at. The app's edit guard compares this
-- column (UPDATE ... WHERE updated_at = <value loaded into the form>), so the build that still reads
-- modified_at fails on saves and edit-conflict checks from the moment this is applied until the new build is
-- live. Apply it immediately before the deploy, never earlier.
--
-- What it does, in one transaction, with no UPDATE of any row:
--   1. RENAME COLUMN modified_at TO updated_at on every public base table that has modified_at and no
--      updated_at (column position, type, NOT NULL and DEFAULT now() are kept).
--   2. Re-points the triggers: every trigger (any schema; archive snapshots just lose it) running set_modified_at() / update_modified_at_column() is
--      dropped and replaced by trg_<table>_set_updated_at running set_updated_at(); then the two old
--      functions are dropped.
--   3. Re-creates any other public function whose body mentions modified_at (set_flight_services) with the
--      new name, grants are kept (CREATE OR REPLACE).
--   4. Fails the whole migration if a modified_at column or a function body still mentions it.
-- Idempotent: tables that have no modified_at are skipped, so databases that never had a table (or already
-- ran this) are fine. Already written migrations are NOT edited: fresh databases replay them and this runs last.
-- Minuteman's tables have no modified_at and are not touched (its code never reads either column).
--
-- Rollback: frontend/supabase/rollbacks/20261104001200_rename_modified_at_to_updated_at.down.sql
-- Apply to live ONLY with: supabase db query --linked --yes -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --yes --status applied 20261104001200

begin;

do $$
declare
  t text;
  r record;
  def text;
begin
  -- 1. rename the column
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.column_name = 'modified_at'
      and not exists (
        select 1 from information_schema.columns x
        where x.table_schema = 'public' and x.table_name = c.table_name and x.column_name = 'updated_at'
      )
    order by c.table_name
  loop
    execute format('alter table public.%I rename column modified_at to updated_at', t);
  end loop;

  -- 2. triggers: old generic functions out, set_updated_at() in. Looks at every schema: the parked
  -- archive.flight_before_reorder_20261104 snapshot also has such a trigger. A trigger on a non-public
  -- (archive) table is only dropped; that table keeps its frozen modified_at column.
  for r in
    select c.relnamespace::regnamespace::text as schema_name, c.relname as table_name, tg.tgname
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_proc p on p.oid = tg.tgfoid
    where not tg.tgisinternal
      and p.pronamespace = 'public'::regnamespace
      and p.proname in ('set_modified_at', 'update_modified_at_column')
    order by 1, 2, 3
  loop
    execute format('drop trigger %I on %I.%I', r.tgname, r.schema_name, r.table_name);
    if r.schema_name = 'public'
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = r.table_name and column_name = 'updated_at'
      )
      and not exists (
        select 1
        from pg_trigger tg2
        join pg_proc p2 on p2.oid = tg2.tgfoid
        where tg2.tgrelid = to_regclass('public.' || quote_ident(r.table_name))
          and not tg2.tgisinternal
          and p2.proname = 'set_updated_at'
      )
    then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'trg_' || r.table_name || '_set_updated_at',
        r.table_name
      );
    end if;
  end loop;

  drop function if exists public.set_modified_at();
  drop function if exists public.update_modified_at_column();

  -- 3. any other function that still names the old column
  for r in
    select p.oid, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%modified_at%'
    order by p.proname
  loop
    def := replace(pg_get_functiondef(r.oid), 'modified_at', 'updated_at');
    execute def;
  end loop;

  -- 4. nothing may be left
  if exists (
    select 1 from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'modified_at'
  ) then
    raise exception 'modified_at still exists on a public table';
  end if;
  if exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) ilike '%modified_at%'
  ) then
    raise exception 'a public function still mentions modified_at';
  end if;
end $$;

commit;
