-- Topics to suggest when a real chat goes quiet: things the twins talked about
-- that the two people haven't brought up yet. Written by
-- src/lib/agents/chat-topics.ts and reused until someone sends a new message.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Server-only: row-level security is on with no policies, so only server code
-- (the admin client) reads and writes it.

create table public.chat_topics (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  -- The last real chat message the topics were written after; new messages
  -- mean the topics get written again.
  based_on_message_id bigint,
  topics jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.chat_topics enable row level security;
