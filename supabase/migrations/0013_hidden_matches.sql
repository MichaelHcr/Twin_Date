-- Matches someone chose to hide from their Passed list. Nothing is deleted:
-- the conversation, report and decisions stay; the app just doesn't list it.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.

create table public.hidden_matches (
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.hidden_matches enable row level security;

-- Each person sees and changes only their own list, and only for their own
-- conversations. The other person never sees it.
create policy "own hidden matches: read" on public.hidden_matches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own hidden matches: add" on public.hidden_matches
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.is_participant(conversation_id));
create policy "own hidden matches: remove" on public.hidden_matches
  for delete to authenticated using ((select auth.uid()) = user_id);
