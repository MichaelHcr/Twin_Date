-- Interests by category: what the person picked on the profile form, the
-- specifics they typed, the items the AI parsed from them, and whether they're
-- open to trying other things in that category. Read by the Scout and the Judge
-- to find shared interests and things one person would like to try.
-- [{category, specifics, items: [text], open: bool}]
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.

alter table public.profiles
  add column if not exists interests jsonb not null default '[]'::jsonb;
