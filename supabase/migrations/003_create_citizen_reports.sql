-- PyroGuard: citizen_reports table
-- Placeholder store for community-submitted fire sightings, surfaced as the
-- "Citizen Reports" tab in Incident History. Empty until a reporting flow exists.

create table if not exists public.citizen_reports (
  id bigint generated always as identity primary key,
  reporter_name text,
  description text not null,
  latitude double precision not null,
  longitude double precision not null,
  photo_url text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

alter table public.citizen_reports enable row level security;

create policy "Public read access" on public.citizen_reports
  for select using (true);
