-- Keep the profile exactly as the user entered it. What the interview learns goes
-- to interview_facts instead, and profile_checks stores the AI's interview summary
-- plus any contradictions between the two, for the user to review.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run. Safe to run again.

create table if not exists public.interview_facts (
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  answer text not null,
  tier text not null default 'open' check (tier in ('soft', 'open')),
  updated_at timestamptz not null default now(),
  primary key (user_id, topic)
);

create table if not exists public.profile_checks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  summary text not null default '',
  -- [{topic, profile_says, interview_says, note, dismissed}]
  conflicts jsonb not null default '[]',
  checked_at timestamptz not null default now()
);

alter table public.interview_facts enable row level security;
alter table public.profile_checks enable row level security;

-- The Interviewer and the consistency check run as the signed-in user.
drop policy if exists "own interview facts" on public.interview_facts;
create policy "own interview facts" on public.interview_facts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own profile checks" on public.profile_checks;
create policy "own profile checks" on public.profile_checks
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Move the interview's earlier notes ("note:<topic>") out of the profile.
insert into public.interview_facts (user_id, topic, answer, tier, updated_at)
select user_id,
       substr(topic, 6),
       answer,
       case when tier = 'soft' then 'soft' else 'open' end,
       created_at
from public.profile_answers
where topic like 'note:%'
on conflict (user_id, topic) do nothing;

delete from public.profile_answers where topic like 'note:%';
