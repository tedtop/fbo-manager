-- Equipment display order: trucks first in the line crew's preferred order,
-- everything else after (NULL sort_order sorts last, then by name).
-- Also records the real fuel truck fleet: adds 5197 and 5059, puts the two
-- trucks that are in the shop (8370, 8178) into maintenance, and describes 3183
-- as the mobile gas station.

alter table equipment add column if not exists sort_order integer;

insert into equipment
  (equipment_id, equipment_name, equipment_type, status, notes)
values
  ('5197', 'Fuel Truck 5197 (Jet A, 5,000 gal)', 'fuel_truck', 'available',
   'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.'),
  ('5059', 'Fuel Truck 5059 (Jet A, 5,000 gal)', 'fuel_truck', 'available',
   'Fuel: Jet A. Capacity: 5000 gal. Front + rear meter registers.')
on conflict (equipment_id) do nothing;

update equipment set sort_order = v.sort_order
from (values
  ('5183', 10), ('8338', 20),               -- Avgas
  ('5282', 30), ('5197', 40), ('5059', 50), -- Jet A, 5,000 gal (line crew preference order)
  ('8628', 60), ('8370', 70), ('8178', 80), -- Jet A, 3,000 gal
  ('3183', 90)                              -- mobile gas station
) as v(equipment_id, sort_order)
where equipment.equipment_id = v.equipment_id;

update equipment set status = 'maintenance',
  notes = notes || ' Twin to 8628. Currently in maintenance.'
where equipment_id = '8370' and status <> 'maintenance';

update equipment set status = 'maintenance',
  notes = notes || ' Cab-over. Currently in maintenance.'
where equipment_id = '8178' and status <> 'maintenance';

update equipment set
  equipment_name = 'Fuel Truck 3183 (Mobile Gas Station)',
  notes = 'Mobile gas station: refuels diesel and unleaded ground equipment. Not used for aircraft fueling.'
where equipment_id = '3183';
