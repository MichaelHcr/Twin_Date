-- Seed users, evaluation pairs, and extra conversation end reasons.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

-- Synthetic users created by scripts/seed.ts, so they can be filtered out or removed.
alter table public.profiles add column is_seed boolean not null default false;

-- Planted test pairs for the evaluation: a dealbreaker conflict, or a compatible match.
-- Server-only (RLS on, no policies).
create table public.seed_pairs (
  id bigint generated always as identity primary key,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('conflict', 'compatible')),
  planted text not null,
  created_at timestamptz not null default now()
);
alter table public.seed_pairs enable row level security;

-- not_a_fit: a twin ended the chat for reasons short of a locked dealbreaker.
-- error: the orchestrator stopped because an agent call failed.
alter table public.conversations drop constraint conversations_end_reason_check;
alter table public.conversations add constraint conversations_end_reason_check
  check (end_reason in ('turn_cap', 'red_flag', 'human_timeout', 'guardrail',
                        'all_topics_covered', 'not_a_fit', 'error'));
