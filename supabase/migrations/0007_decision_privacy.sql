-- Tighter rules for Yes / Pass decisions and profile photos (review of PR #8).
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Run 0006_photos.sql first. This file is safe to run more than once.
--
-- 1. A decision can only be saved inside a conversation the user belongs to,
--    and can't be changed once both people want to meet.
-- 2. Each person reads only their own decision, plus the other side's
--    connection request (shown on purpose). Their yes or pass stays private;
--    public.decision_states() tells the app who is connected.
-- 3. A match counts only the decisions of the conversation's two members.
-- 4. profiles.photos may only hold files from the user's own folder.

-- ---------- Mutual match ----------

-- True when the signed-in user is part of the conversation and both of its
-- members want to meet ("yes" or "request"). Same rule as src/lib/decisions.ts.
create or replace function public.is_connected(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.decisions da on da.conversation_id = c.id and da.user_id = c.user_a
    join public.decisions db on db.conversation_id = c.id and db.user_id = c.user_b
    where c.id = conv
      and (select auth.uid()) in (c.user_a, c.user_b)
      and da.decision in ('yes', 'request')
      and db.decision in ('yes', 'request')
  );
$$;

-- Where things stand on each of the signed-in user's conversations, without
-- revealing the other side's yes or pass: only whether they sent a request,
-- and whether the two are connected.
create or replace function public.decision_states()
returns table (conversation_id uuid, mine text, they_requested boolean, connected boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    m.decision,
    coalesce(t.decision = 'request', false),
    coalesce(m.decision in ('yes', 'request') and t.decision in ('yes', 'request'), false)
  from public.conversations c
  left join public.decisions m
    on m.conversation_id = c.id and m.user_id = (select auth.uid())
  left join public.decisions t
    on t.conversation_id = c.id
   and t.user_id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  where (select auth.uid()) in (c.user_a, c.user_b);
$$;

revoke execute on function public.decision_states() from public, anon;
grant execute on function public.decision_states() to authenticated;

-- ---------- Decision policies ----------

-- Remove any decision saved under someone who isn't one of the conversation's members.
delete from public.decisions d
using public.conversations c
where c.id = d.conversation_id and d.user_id not in (c.user_a, c.user_b);

drop policy if exists "participants: read decisions" on public.decisions;
drop policy if exists "own decision or their request: read" on public.decisions;
create policy "own decision or their request: read" on public.decisions
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or (decision = 'request' and public.is_participant(conversation_id))
  );

drop policy if exists "participants: make own decision" on public.decisions;
create policy "participants: make own decision" on public.decisions
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_participant(conversation_id));

drop policy if exists "participants: change own decision" on public.decisions;
create policy "participants: change own decision" on public.decisions
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    and public.is_participant(conversation_id)
    and not public.is_connected(conversation_id)
  )
  with check ((select auth.uid()) = user_id and public.is_participant(conversation_id));

-- ---------- Photo paths ----------

-- True when every path is <owner>/<uuid>.<jpg|png|webp>, the only shape the app uploads.
create or replace function public.photo_paths_ok(owner uuid, paths text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    bool_and(p ~ ('^' || owner::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')),
    true
  )
  from unnest(paths) as p;
$$;

-- Drop any path that doesn't fit, so the check below can be added.
update public.profiles
set photos = array(
  select p from unnest(photos) as p
  where public.photo_paths_ok(user_id, array[p])
)
where not public.photo_paths_ok(user_id, photos);

alter table public.profiles drop constraint if exists profiles_photos_own_folder;
alter table public.profiles add constraint profiles_photos_own_folder
  check (public.photo_paths_ok(user_id, photos));
