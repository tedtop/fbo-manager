-- Rollback of 20261105000100_truck_sheet_scan_pages.sql. Fails if rows with doc_type 'schedule_sheet' exist (delete them first).
drop policy if exists "Authenticated users can read scans" on storage.objects;
drop policy if exists "Authenticated users can upload scans" on storage.objects;
drop policy if exists "Authenticated users can delete scans" on storage.objects;
drop policy if exists "Authenticated users can manage scanned documents" on scanned_documents;
alter table scanned_documents disable row level security;
drop index if exists uq_scanned_documents_sheet_page;
drop index if exists uq_scanned_documents_sheet_hash;
drop index if exists idx_scanned_documents_hash;
drop index if exists idx_scanned_documents_truck_date;
alter table scanned_documents drop constraint scanned_documents_doc_type_check;
alter table scanned_documents
  add constraint scanned_documents_doc_type_check check (doc_type in ('truck_sheet', 'invoice_slip'));
alter table scanned_documents
  drop column rotation_degrees,
  drop column content_sha256,
  drop column thumb_path,
  drop column original_path,
  drop column original_page,
  drop column original_content_type,
  drop column fuel_truck_id,
  drop column scan_date;
