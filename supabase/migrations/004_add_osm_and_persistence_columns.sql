-- PyroGuard: OSM land-use enrichment + persistent thermal source tracking
-- grid_cell buckets detections to ~1.1km cells so recurring hotspots at the
-- same physical location (gas flares, coal seam fires) can be aggregated
-- across multiple satellite passes/days. osm_landuse stores the real OSM
-- Overpass API land-use classification used to refine fire_type.

alter table public.fire_detections
  add column if not exists grid_cell text,
  add column if not exists osm_landuse text;

create index if not exists fire_detections_grid_cell_idx on public.fire_detections (grid_cell);
