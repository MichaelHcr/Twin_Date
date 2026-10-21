-- The match card's short version of each report: a one-line headline and a few
-- tags, written once by src/lib/agents/match-card.ts and reused after that.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Server code writes it with the admin client; the existing "participants: read
-- report" policy already covers reading it.
alter table public.reports add column if not exists card_json jsonb;
