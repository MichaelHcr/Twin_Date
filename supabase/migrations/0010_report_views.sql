-- Match reports written from each person's point of view (pros, cons, red flags,
-- next steps), so the report page can say "you" and "this match" instead of
-- "Member A" and "Member B". Shape: {"a": View, "b": View}, see src/lib/agents/judge.ts.
-- Older reports have no views and show their plain summary.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.

alter table public.reports add column if not exists views jsonb;
