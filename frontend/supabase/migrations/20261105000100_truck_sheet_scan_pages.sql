-- B69: truck sheet scan pages. One scanned_documents row per UPRIGHT page image, linked to the truck sheet and truck,
-- with the rotation applied, a content hash (exact duplicate re-scans), and a reference to the original upload (a PDF
-- is stored once and referenced by each of its pages). Also: RLS on scanned_documents (it had none) and storage
-- policies for the private 'scans' bucket (it had none, so browser sessions could neither upload nor sign URLs).
-- Layout of the object paths: docs/PLAN.md "Truck sheet scan storage and page attachment".

alter table scanned_documents
  add column rotation_degrees smallint not null default 0 check (rotation_degrees in (0, 90, 180, 270)),
  add column content_sha256 text,
  add column original_path text,
  add column original_page smallint,
  add column original_content_type text,
  add column fuel_truck_id integer references equipment(id) on delete set null,
  add column scan_date date;

alter table scanned_documents drop constraint scanned_documents_doc_type_check;
alter table scanned_documents
  add constraint scanned_documents_doc_type_check
  check (doc_type in ('truck_sheet', 'invoice_slip', 'schedule_sheet'));

-- a sheet cannot get two page 2s, nor the same page image twice
create unique index uq_scanned_documents_sheet_page
  on scanned_documents (truck_sheet_id, page_number)
  where truck_sheet_id is not null and page_number is not null;
create unique index uq_scanned_documents_sheet_hash
  on scanned_documents (truck_sheet_id, content_sha256)
  where truck_sheet_id is not null and content_sha256 is not null;
create index idx_scanned_documents_hash on scanned_documents (content_sha256) where content_sha256 is not null;
create index idx_scanned_documents_truck_date on scanned_documents (fuel_truck_id, scan_date);

alter table scanned_documents enable row level security;
create policy "Authenticated users can manage scanned documents"
  on scanned_documents for all
  using (auth.role() = 'authenticated');

-- storage policies for the 'scans' bucket (guarded: the storage schema is absent on plain-Postgres targets)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    execute $p$ drop policy if exists "Authenticated users can read scans" on storage.objects $p$;
    execute $p$ drop policy if exists "Authenticated users can upload scans" on storage.objects $p$;
    execute $p$ drop policy if exists "Authenticated users can delete scans" on storage.objects $p$;
    execute $p$ create policy "Authenticated users can read scans" on storage.objects for select
      using (bucket_id = 'scans' and auth.role() = 'authenticated') $p$;
    execute $p$ create policy "Authenticated users can upload scans" on storage.objects for insert
      with check (bucket_id = 'scans' and auth.role() = 'authenticated') $p$;
    execute $p$ create policy "Authenticated users can delete scans" on storage.objects for delete
      using (bucket_id = 'scans' and auth.role() = 'authenticated') $p$;
  end if;
end $$;
