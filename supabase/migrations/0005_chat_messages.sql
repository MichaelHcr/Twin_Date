-- Person-to-person chat, opened once both people want to meet (PRD: Users and core flow, step 9).
-- Separate from public.messages, which holds the twins' transcript.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table public.chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index on public.chat_messages (conversation_id, created_at);

alter table public.chat_messages enable row level security;

-- True when the signed-in user is part of the conversation and both sides
-- want to meet ("yes" or "request"), the same rule as src/lib/decisions.ts.
create function public.is_connected(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_participant(conv) and (
    select count(*) from public.decisions d
    where d.conversation_id = conv and d.decision in ('yes', 'request')
  ) = 2;
$$;

create policy "connected: read chat" on public.chat_messages
  for select to authenticated using (public.is_connected(conversation_id));
create policy "connected: send chat" on public.chat_messages
  for insert to authenticated
  with check ((select auth.uid()) = sender_id and public.is_connected(conversation_id));

-- Live updates: the chat page listens for new rows. Realtime still applies the
-- policies above, so each person only receives their own chats.
alter publication supabase_realtime add table public.chat_messages;
