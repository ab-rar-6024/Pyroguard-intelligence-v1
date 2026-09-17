-- PyroGuard: add fire_type classification to fire_detections
-- Categorizes each stored detection as WILDFIRE, URBAN_FIRE, GAS_FLARE,
-- MINING_THERMAL, or UNCLASSIFIED for the Incident History breakdown.

alter table public.fire_detections
  add column if not exists fire_type text not null default 'UNCLASSIFIED';

create index if not exists fire_detections_fire_type_idx on public.fire_detections (fire_type);
