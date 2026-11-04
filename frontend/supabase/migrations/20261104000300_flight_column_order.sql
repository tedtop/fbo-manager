-- Rebuild public.flight so its columns read in a logical order (Ted, 2026-11-04). Postgres cannot move a
-- column, so the table is rebuilt: new table with the target order, rows copied, old table parked.
--
-- Target order: id, aircraft_id, call_sign, flight_status, scheduled_arrival_time, scheduled_departure_time,
--   is_quick_turn, actual_arrival_time, actual_departure_time, origin, destination, contact_name,
--   contact_notes, services, fueled_at, fuel_order_notes, passenger_count, notes, location_id,
--   created_by_id, created_by_source, created_at, modified_at, <any other columns, as before>, deleted_at
--
-- Shape is read from the catalog (columns, defaults, identity, constraints, indexes, trigger, grants,
-- column comments, inbound foreign keys), so the same file works on live and on the local stack, which
-- carries two extra columns (assigned_fueler_id, available_at). It refuses to run (and changes nothing)
-- if it finds something it does not rebuild: policies, dependent views, generated columns, inheritance,
-- partitions, non-default collations or column-level grants.
--
-- * Nothing is dropped. The old table is renamed and moved to schema "archive" as
--   archive.flight_before_reorder_20261104; its foreign keys are removed (so it cannot block deleting an
--   aircraft or user), it leaves the realtime publication, and anon/authenticated lose access. Drop it
--   yourself once you are happy: drop table archive.flight_before_reorder_20261104;
-- * Row ids are kept; the new identity sequence continues after the old one.
-- * Grants are copied exactly (the 2026-11-02 migration revoked anon; new tables would otherwise inherit
--   Supabase's default grants to anon).
-- * public.flight is added to the supabase_realtime publication (the board's realtime channel needs it;
--   live was not in the publication before this).
-- * Inside the transaction it checks that every row came across identically, else it aborts.
-- * Holds an ACCESS EXCLUSIVE lock on flight for the duration (a fraction of a second at this size).
--
-- Safe to re-run: a table already in this order is left alone.
-- Rollback: frontend/supabase/rollbacks/20261104000300_flight_column_order.down.sql
-- Apply to live ONLY with: supabase db query --linked -f <this file>  (never `supabase db push`),
-- then: supabase migration repair --linked --status applied 20261104000300

begin;

do $rebuild$
declare
  v_archive constant text := 'flight_before_reorder_20261104';
  v_suffix  constant text := '__reorder';  -- renames the parked table's indexes/sequences so schema archive never clashes
  v_first   constant text[] := array[
    'id', 'aircraft_id', 'call_sign', 'flight_status', 'scheduled_arrival_time', 'scheduled_departure_time',
    'is_quick_turn', 'actual_arrival_time', 'actual_departure_time', 'origin', 'destination', 'contact_name',
    'contact_notes', 'services', 'fueled_at', 'fuel_order_notes', 'passenger_count', 'notes', 'location_id',
    'created_by_id', 'created_by_source', 'created_at', 'modified_at'];
  v_last    constant text[] := array['deleted_at'];
  v_old     oid := 'public.flight'::regclass;
  v_current text[];
  v_final   text[];
  v_extra   text[];
  v_collist text;
  v_coldefs text;
  v_seq_last  bigint;
  v_seq_called boolean;
  v_max     bigint;
  v_next    bigint;
  v_newseq  text;
  v_rls     boolean;
  v_repl    "char";
  v_rows_old bigint;
  v_rows_new bigint;
  v_diff    bigint;
  r         record;
begin
  -- Current and target column order.
  select array_agg(attname::text order by attnum) into v_current
  from pg_attribute where attrelid = v_old and attnum > 0 and not attisdropped;

  select array_agg(c order by o) into v_extra
  from unnest(v_current) with ordinality as t(c, o)
  where c <> all (v_first) and c <> all (v_last);

  v_final := array(select c from unnest(v_first) c where c = any (v_current))
          || coalesce(v_extra, '{}')
          || array(select c from unnest(v_last) c where c = any (v_current));

  if cardinality(v_final) <> cardinality(v_current) then
    raise exception 'flight column order: target (%) does not cover the table (%)', v_final, v_current;
  end if;
  if v_final = v_current then
    raise notice 'flight columns are already in the target order; nothing to do';
    return;
  end if;

  -- Refuse anything this rebuild does not carry over.
  if exists (select 1 from pg_class where oid = v_old and (relkind <> 'r' or relispartition or relhasrules
                                                          or reloptions is not null or relforcerowsecurity)) then
    raise exception 'flight is partitioned, has rules, storage options or forced RLS: not rebuilt by this migration';
  end if;
  if exists (select 1 from pg_inherits where inhrelid = v_old or inhparent = v_old) then
    raise exception 'flight takes part in table inheritance: not rebuilt by this migration';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'flight') then
    raise exception 'flight has RLS policies: not rebuilt by this migration';
  end if;
  if exists (select 1 from pg_depend d join pg_rewrite w on w.oid = d.objid
             where d.refobjid = v_old and d.classid = 'pg_rewrite'::regclass and w.ev_class <> v_old) then
    raise exception 'a view depends on flight: not rebuilt by this migration';
  end if;
  if exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
             where a.attrelid = v_old and a.attnum > 0 and not a.attisdropped
               and (a.attgenerated <> '' or a.attacl is not null or a.attcollation <> t.typcollation)) then
    raise exception 'flight has generated columns, column grants or custom collations: not rebuilt by this migration';
  end if;
  if exists (select 1 from pg_constraint where conrelid = v_old and contype not in ('p', 'u', 'c', 'f')) then
    raise exception 'flight has an unsupported constraint type: not rebuilt by this migration';
  end if;

  lock table public.flight in access exclusive mode;

  -- Capture everything while the old table is still public.flight (definitions embed the name).
  create temp table _fr_constraints on commit drop as
    select conname::text as name, contype::text as kind, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = v_old;
  create temp table _fr_indexes on commit drop as
    select pg_get_indexdef(i.indexrelid) as def
    from pg_index i
    where i.indrelid = v_old
      and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid);
  create temp table _fr_triggers on commit drop as
    select pg_get_triggerdef(oid) as def from pg_trigger where tgrelid = v_old and not tgisinternal;
  create temp table _fr_inbound on commit drop as
    select conrelid::regclass::text as child, conname::text as name, pg_get_constraintdef(oid) as def
    from pg_constraint where confrelid = v_old and conrelid <> v_old;
  create temp table _fr_table_acl on commit drop as
    select case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end as grantee, g.privilege_type, g.is_grantable
    from pg_class c, aclexplode(c.relacl) g
    where c.oid = v_old and g.grantee <> c.relowner;
  create temp table _fr_comments on commit drop as
    select a.attname::text as col, d.description
    from pg_description d join pg_attribute a on a.attrelid = d.objoid and a.attnum = d.objsubid
    where d.objoid = v_old and d.classoid = 'pg_class'::regclass and d.objsubid > 0;
  select relrowsecurity, relreplident into v_rls, v_repl from pg_class where oid = v_old;

  -- Sequences owned by the table's columns: identity (live) or serial (local).
  create temp table _fr_seqs on commit drop as
    select a.attname::text as col, c.oid::regclass::text as old_seq, c.relname::text as seq_name,
           (a.attidentity <> '') as is_identity, format_type(q.seqtypid, null) as seq_type,
           left(c.relname::text, 50) || v_suffix as parked_seq,
           null::bigint as last_value, null::boolean as is_called
    from pg_depend d
    join pg_class c on c.oid = d.objid and c.relkind = 'S'
    join pg_sequence q on q.seqrelid = c.oid
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
    where d.refobjid = v_old and d.classid = 'pg_class'::regclass and d.deptype in ('a', 'i');
  for r in select col, old_seq from _fr_seqs loop
    execute format('select last_value, is_called from %s', r.old_seq) into v_seq_last, v_seq_called;
    update _fr_seqs set last_value = v_seq_last, is_called = v_seq_called where col = r.col;
  end loop;
  create temp table _fr_seq_acl on commit drop as
    select q.col, case when g.grantee = 0 then 'PUBLIC' else pg_get_userbyid(g.grantee) end as grantee,
           g.privilege_type, g.is_grantable
    from _fr_seqs q join pg_class c on c.oid = q.old_seq::regclass, aclexplode(c.relacl) g
    where g.grantee <> c.relowner;

  -- Column list for the new table, in the target order.
  select string_agg(format('%I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case a.attidentity when 'd' then ' generated by default as identity'
                                              when 'a' then ' generated always as identity' else '' end,
                           case when exists (select 1 from _fr_seqs q where q.col = a.attname and not q.is_identity)
                                then '' else coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') end,
                           case when a.attnotnull and a.attidentity = '' then ' not null' else '' end),
                    ', ' order by array_position(v_final, a.attname::text)),
         string_agg(quote_ident(a.attname), ', ' order by array_position(v_final, a.attname::text))
    into v_coldefs, v_collist
  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = v_old and a.attnum > 0 and not a.attisdropped;

  -- Park the old table. Dropping its foreign keys keeps it from blocking deletes of aircraft/users, and
  -- the three tables that point at flight are re-pointed at the new table below.
  for r in select child, name from _fr_inbound loop
    execute format('alter table %s drop constraint %I', r.child, r.name);
  end loop;
  execute format('alter table public.flight rename to %I', v_archive);
  -- Index and sequence names are unique per schema: give the parked table's a run-specific suffix so a
  -- later rebuild (the rollback) can park its own table in archive without clashing.
  for r in select conname::text as name from pg_constraint where conrelid = v_old and contype in ('p', 'u') loop
    execute format('alter table public.%I rename constraint %I to %I', v_archive, r.name, left(r.name, 50) || v_suffix);
  end loop;
  for r in select ic.relname::text as idx from pg_index i join pg_class ic on ic.oid = i.indexrelid
           where i.indrelid = v_old and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid) loop
    execute format('alter index public.%I rename to %I', r.idx, left(r.idx, 50) || v_suffix);
  end loop;
  for r in select seq_name, parked_seq from _fr_seqs loop
    execute format('alter sequence public.%I rename to %I', r.seq_name, r.parked_seq);
  end loop;
  create schema if not exists archive;
  execute format('alter table public.%I set schema archive', v_archive);
  for r in select name from _fr_constraints where kind = 'f' loop
    execute format('alter table archive.%I drop constraint %I', v_archive, r.name);
  end loop;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
             and schemaname = 'archive' and tablename = v_archive) then
    execute format('alter publication supabase_realtime drop table archive.%I', v_archive);
  end if;
  execute format('revoke all on archive.%I from public, anon, authenticated, service_role', v_archive);
  for r in select parked_seq from _fr_seqs loop
    execute format('revoke all on sequence archive.%I from public, anon, authenticated, service_role', r.parked_seq);
  end loop;

  -- New table, rows, identity position.
  execute format('create table public.flight (%s)', v_coldefs);
  execute format('insert into public.flight (%1$s) overriding system value select %1$s from archive.%2$I order by id',
                 v_collist, v_archive);
  for r in select * from _fr_seqs loop
    execute format('select coalesce(max(%I), 0) + 1 from public.flight', r.col) into v_max;
    v_next := greatest(case when r.is_called then r.last_value + 1 else r.last_value end, v_max);
    if r.is_identity then
      execute format('alter table public.flight alter column %I restart with %s', r.col, v_next);
    else
      execute format('create sequence public.%I as %s owned by public.flight.%I', r.seq_name, r.seq_type, r.col);
      execute format('alter table public.flight alter column %I set default nextval(%L)', r.col,
                     'public.' || quote_ident(r.seq_name));
      execute format('select setval(%L, %s, false)', 'public.' || quote_ident(r.seq_name), v_next);
    end if;
  end loop;

  -- Constraints (keys and checks first, then foreign keys), indexes, trigger, inbound foreign keys.
  for r in select name, def from _fr_constraints where kind in ('p', 'u') loop
    execute format('alter table public.flight add constraint %I %s', r.name, r.def);
  end loop;
  for r in select name, def from _fr_constraints where kind = 'c' loop
    execute format('alter table public.flight add constraint %I %s', r.name, r.def);
  end loop;
  for r in select name, def from _fr_constraints where kind = 'f' loop
    execute format('alter table public.flight add constraint %I %s', r.name, r.def);
  end loop;
  for r in select def from _fr_indexes loop execute r.def; end loop;
  for r in select def from _fr_triggers loop execute r.def; end loop;
  for r in select child, name, def from _fr_inbound loop
    execute format('alter table %s add constraint %I %s', r.child, r.name, r.def);
  end loop;

  -- Privileges: start from nothing (new tables inherit Supabase's default grants, including anon), then
  -- copy the old table's grants exactly.
  revoke all on public.flight from public, anon, authenticated, service_role;
  for r in select * from _fr_table_acl loop
    execute format('grant %s on public.flight to %s%s', r.privilege_type,
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;
  for r in select col from _fr_seqs loop
    v_newseq := pg_get_serial_sequence('public.flight', r.col);
    execute format('revoke all on sequence %s from public, anon, authenticated, service_role', v_newseq);
  end loop;
  for r in select * from _fr_seq_acl loop
    execute format('grant %s on sequence %s to %s%s', r.privilege_type,
                   pg_get_serial_sequence('public.flight', r.col),
                   case when r.grantee = 'PUBLIC' then 'public' else quote_ident(r.grantee) end,
                   case when r.is_grantable then ' with grant option' else '' end);
  end loop;

  for r in select col, description from _fr_comments loop
    execute format('comment on column public.flight.%I is %L', r.col, r.description);
  end loop;
  if v_rls then alter table public.flight enable row level security; end if;
  if v_repl <> 'd' then
    execute format('alter table public.flight replica identity %s',
                   case v_repl when 'f' then 'full' when 'n' then 'nothing' else 'default' end);
  end if;

  -- Realtime: the board subscribes to postgres_changes on public.flight.
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'flight') then
    alter publication supabase_realtime add table public.flight;
  end if;

  -- Every row must have come across identically, and the order must be the target.
  execute format('select count(*) from archive.%I', v_archive) into v_rows_old;
  select count(*) into v_rows_new from public.flight;
  execute format('select count(*) from (select to_jsonb(o) from archive.%I o except select to_jsonb(n) from public.flight n) x',
                 v_archive) into v_diff;
  if v_rows_old <> v_rows_new or v_diff <> 0 then
    raise exception 'flight rebuild: row copy mismatch (old %, new %, differing %)', v_rows_old, v_rows_new, v_diff;
  end if;
  if (select array_agg(attname::text order by attnum) from pg_attribute
      where attrelid = 'public.flight'::regclass and attnum > 0 and not attisdropped) <> v_final then
    raise exception 'flight rebuild: columns are not in the target order';
  end if;

  drop table _fr_constraints, _fr_indexes, _fr_triggers, _fr_inbound, _fr_table_acl, _fr_comments, _fr_seqs, _fr_seq_acl;
  analyze public.flight;
  raise notice 'flight rebuilt: % rows, old table kept as archive.%', v_rows_new, v_archive;
end
$rebuild$;

commit;
