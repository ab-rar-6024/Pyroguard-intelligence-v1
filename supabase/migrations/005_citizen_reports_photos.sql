-- PyroGuard: citizen fire-sighting photo uploads
-- Adds a landmark field to citizen_reports and creates a public storage bucket
-- for reference photos attached to ground-truth sightings.

alter table public.citizen_reports
  add column if not exists landmark text;

insert into storage.buckets (id, name, public)
values ('citizen-reports-photos', 'citizen-reports-photos', true)
on conflict (id) do nothing;

-- Public bucket: anyone can view uploaded photos (needed to render them in the
-- Incident History "Citizen Reports" tab). Writes only happen server-side via the
-- service_role key, which bypasses storage RLS entirely, so no insert policy is needed.
create policy "Public read access to citizen report photos"
  on storage.objects for select
  using (bucket_id = 'citizen-reports-photos');
