-- Unread chat messages: when each person last read each chat.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table public.chat_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.chat_reads enable row level security;

create policy "own chat reads: read" on public.chat_reads
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own chat reads: add" on public.chat_reads
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_connected(conversation_id));
create policy "own chat reads: update" on public.chat_reads
  for update to authenticated using ((select auth.uid()) = user_id);

-- Marks a chat as read up to now, using the database clock (the same one that
-- stamps chat_messages.created_at).
create function public.mark_chat_read(conv uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.chat_reads (conversation_id, user_id, last_read_at)
  values (conv, (select auth.uid()), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
$$;

-- One row per chat the signed-in user can see: unread count, and the latest
-- message for previews. Runs as the caller, so chat_messages' policies still
-- decide which chats are included.
create function public.chat_summaries()
returns table (
  conversation_id uuid,
  unread bigint,
  last_content text,
  last_at timestamptz,
  last_from_me boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (m.conversation_id) m.conversation_id as conv, m.content, m.created_at, m.sender_id
    from public.chat_messages m
    order by m.conversation_id, m.created_at desc, m.id desc
  ),
  counts as (
    select m.conversation_id as conv, count(*) as n
    from public.chat_messages m
    left join public.chat_reads r
      on r.conversation_id = m.conversation_id and r.user_id = (select auth.uid())
    where m.sender_id <> (select auth.uid())
      and (r.last_read_at is null or m.created_at > r.last_read_at)
    group by m.conversation_id
  )
  select l.conv, coalesce(c.n, 0), l.content, l.created_at, l.sender_id = (select auth.uid())
  from latest l
  left join counts c on c.conv = l.conv;
$$;
