-- There is no fuel truck 8128: the 2026-07-10 truck sheet import misread the
-- truck number of 8628. Re-point that sheet to 8628 and remove the bogus
-- equipment row (truck_sheets.fuel_truck_id is ON DELETE RESTRICT).

update truck_sheets
set fuel_truck_id = (select id from equipment where equipment_id = '8628'),
    truck_number = '8628'
where fuel_truck_id = (select id from equipment where equipment_id = '8128');

delete from equipment where equipment_id = '8128';
