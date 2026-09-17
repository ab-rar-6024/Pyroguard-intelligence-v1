-- PyroGuard: fire_detections table
-- Stores every NASA FIRMS thermal anomaly detection processed by the server,
-- along with the nearest-facility threat context (blast radius, wind, ETA, etc).
-- Run this once in the Supabase SQL Editor for project zpqjdvomzdnpqxddevqn.

create table if not exists public.fire_detections (
  id bigint generated always as identity primary key,
  detection_id text not null,                -- FIRMS-* anomaly id at time of capture
  satellite text not null,                    -- fire/sensor type, e.g. VIIRS-NOAA20
  confidence text not null,                   -- nominal | high | critical | low
  acq_date text not null,
  acq_time text not null,
  daynight text not null,

  latitude double precision not null,
  longitude double precision not null,
  brightness_k double precision not null,     -- Brightness temperature (K)
  bright_t31_k double precision,
  frp_mw double precision not null,           -- Fire Radiative Power (MW)

  wind_speed_kmh double precision not null,
  wind_direction_deg double precision not null,
  wind_spread_risk text,                      -- DIRECT | CROSSWIND | AWAY | STAGNANT

  facility_id text,
  facility_name text,
  facility_type text,
  facility_country text,
  facility_region text,
  hazard_level text,                          -- EXTREME | HIGH | MODERATE
  primary_chemicals text[],
  blast_radius_km double precision,
  toxic_plume_radius_km double precision,

  distance_km double precision,               -- "Perimeter" - distance from fire to facility
  threat_score int,
  threat_level text,                          -- CRITICAL | HIGH | ELEVATED | WATCH
  time_to_impact_hours double precision,       -- "ETA"

  recorded_at timestamptz not null default now(),

  -- de-dupe the same underlying satellite pass across repeated 15s polls
  unique (latitude, longitude, acq_date, acq_time, satellite)
);

create index if not exists fire_detections_recorded_at_idx on public.fire_detections (recorded_at desc);
create index if not exists fire_detections_threat_level_idx on public.fire_detections (threat_level);
create index if not exists fire_detections_facility_id_idx on public.fire_detections (facility_id);

alter table public.fire_detections enable row level security;

-- Server writes with the service_role key, which bypasses RLS automatically.
-- This policy just allows read access if you ever query the table with the anon key.
create policy "Public read access" on public.fire_detections
  for select using (true);
