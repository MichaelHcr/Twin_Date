-- Hearts on chat messages, and "Seen" for the last message you sent.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Run 0008_chat_reads.sql first.

create table public.chat_reactions (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index on public.chat_reactions (conversation_id);

alter table public.chat_reactions enable row level security;

-- Both people in a connected chat see its hearts; each adds and removes only
-- their own, and only on a message that belongs to that chat.
create policy "connected: read hearts" on public.chat_reactions
  for select to authenticated using (public.is_connected(conversation_id));
create policy "connected: add own heart" on public.chat_reactions
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_connected(conversation_id)
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.conversation_id = chat_reactions.conversation_id
    )
  );
create policy "own heart: remove" on public.chat_reactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- When the other person last read this chat, for "Seen". chat_reads stays
-- private to its owner; this returns only the time, and only to someone
-- connected in that chat.
create function public.chat_other_read_at(conv uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select r.last_read_at
  from public.chat_reads r
  where public.is_connected(conv)
    and r.conversation_id = conv
    and r.user_id <> (select auth.uid());
$$;

revoke execute on function public.chat_other_read_at(uuid) from public, anon;
grant execute on function public.chat_other_read_at(uuid) to authenticated;
