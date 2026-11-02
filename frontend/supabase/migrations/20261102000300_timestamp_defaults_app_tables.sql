-- Fix: creating an aircraft (and other rows) from the app failed on live because the Django-era
-- tables declare created_at / modified_at NOT NULL with no default, while the local test schema
-- has default now() (so tests passed). Additive only: sets DEFAULT now(); no data changes.
-- Touches ONLY these app-owned tables: aircraft, customer, invoice, invoice_item, product,
-- training, fueler, fueler_training, fueler_training_history.
-- Deliberately NOT touched: fuel_tank, fuel_transaction, users (live-application tables).
begin;
alter table aircraft                alter column created_at set default now(), alter column modified_at set default now();
alter table customer                alter column created_at set default now(), alter column modified_at set default now();
alter table invoice                 alter column created_at set default now(), alter column modified_at set default now();
alter table invoice_item            alter column created_at set default now();
alter table product                 alter column created_at set default now(), alter column modified_at set default now();
alter table training                alter column created_at set default now(), alter column modified_at set default now();
alter table fueler                  alter column created_at set default now(), alter column modified_at set default now();
alter table fueler_training         alter column created_at set default now(), alter column modified_at set default now();
alter table fueler_training_history alter column created_at set default now();
commit;
