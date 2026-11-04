-- Only valid while every equipment row uses one of the original types.
alter table public.equipment add constraint equipment_equipment_type_check check (equipment_type in (
  'fuel_truck','tug','gpu','air_start','belt_loader','stairs',
  'lavatory_service','water_service','golf_cart','staff_vehicle','other'
));
