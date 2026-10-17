-- Twin Date initial schema (tables from the PRD "Data model" section).
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Security model: Row Level Security (RLS) is on for every table.
-- The browser can only see rows the policies below allow. Agents and webhooks
-- run on the server with the secret key, which bypasses RLS.

-- ---------- Profiles ----------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  birthdate date,
  gender text,
  seeking text[] not null default '{}',
  age_min int check (age_min >= 18),
  age_max int check (age_max >= age_min),
  lat double precision,
  lng double precision,
  radius_km int not null default 50,
  goal text check (goal in ('long_term', 'short_term', 'open')),
  photos text[] not null default '{}',
  screening_enabled boolean not null default false,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per core-topic answer or dealbreaker, with its improvisation tier.
create table public.profile_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  answer text not null,
  tier text not null check (tier in ('locked', 'soft', 'open')),
  created_at timestamptz not null default now(),
  unique (user_id, topic)
);

create table public.interview_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- A new version on every rebuild. The embedding column is added in the matching step.
create table public.persona_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null,
  card_json jsonb not null,
  style_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

-- ---------- Twin conversations ----------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'waiting_human', 'ended')),
  turn_count int not null default 0,
  end_reason text check (end_reason in ('turn_cap', 'red_flag', 'human_timeout', 'guardrail', 'all_topics_covered')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_a <> user_b)
);

-- Answers from ask_my_human; the source conversation is kept for context.
create table public.learned_facts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  source_conversation_id uuid references public.conversations (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The shared transcript.
create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  speaker text not null check (speaker in ('a', 'b')),
  author text not null default 'twin' check (author in ('twin', 'human')),
  content text not null,
  turn int not null,
  created_at timestamptz not null default now()
);

-- Private to each twin and the Judge: no browser access at all.
create table public.ledgers (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  owner text not null check (owner in ('a', 'b')),
  pros jsonb not null default '[]',
  cons jsonb not null default '[]',
  red_flags jsonb not null default '[]',
  assumptions jsonb not null default '[]',
  open_questions jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (conversation_id, owner)
);

create table public.human_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  question text not null,
  answer text,
  status text not null default 'pending' check (status in ('pending', 'answered', 'expired')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- ---------- Reports and decisions ----------

create table public.reports (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  score int not null check (score between 0 and 100),
  summary text not null,
  evidence_json jsonb not null default '[]',
  red_flags jsonb not null default '[]',
  questions_to_ask jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.decisions (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('yes', 'pass', 'request')),
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------- Payments ----------

-- Written only by the Stripe webhook (server side).
create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'plus', 'pro')),
  stripe_customer_id text,
  period_end timestamptz,
  used_this_week int not null default 0
);

-- ---------- Indexes ----------

create index on public.interview_messages (user_id, created_at);
create index on public.persona_cards (user_id, version desc);
create index on public.conversations (user_a);
create index on public.conversations (user_b);
create index on public.messages (conversation_id, turn);
create index on public.human_questions (user_id, status);

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.profile_answers enable row level security;
alter table public.interview_messages enable row level security;
alter table public.persona_cards enable row level security;
alter table public.conversations enable row level security;
alter table public.learned_facts enable row level security;
alter table public.messages enable row level security;
alter table public.ledgers enable row level security;
alter table public.human_questions enable row level security;
alter table public.reports enable row level security;
alter table public.decisions enable row level security;
alter table public.subscriptions enable row level security;

-- True when the signed-in user is one side of the conversation.
create function public.is_participant(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (select auth.uid()) in (c.user_a, c.user_b)
  );
$$;

-- Own rows only.
create policy "own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own profile: update" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id);

create policy "own answers" on public.profile_answers
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own interview" on public.interview_messages
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own persona: read" on public.persona_cards
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "own learned facts: read" on public.learned_facts
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "own questions: read" on public.human_questions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own questions: answer" on public.human_questions
  for update to authenticated using ((select auth.uid()) = user_id);

create policy "own subscription: read" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- Both sides of a conversation can read it, its transcript and its report.
create policy "participants: read conversation" on public.conversations
  for select to authenticated using ((select auth.uid()) in (user_a, user_b));

create policy "participants: read transcript" on public.messages
  for select to authenticated using (public.is_participant(conversation_id));

create policy "participants: read report" on public.reports
  for select to authenticated using (public.is_participant(conversation_id));

create policy "participants: read decisions" on public.decisions
  for select to authenticated using (public.is_participant(conversation_id));
create policy "participants: make own decision" on public.decisions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_participant(conversation_id));
create policy "participants: change own decision" on public.decisions
  for update to authenticated
  using ((select auth.uid()) = user_id);

-- ledgers: RLS on with no policies, so only server code can read or write them.

-- ---------- New-user setup ----------

-- Every new sign-up gets an empty profile and a free subscription.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
