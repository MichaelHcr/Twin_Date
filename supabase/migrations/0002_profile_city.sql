-- Adds a human-readable city to profiles. lat/lng are filled in later by the matching step.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
alter table public.profiles add column city text;
