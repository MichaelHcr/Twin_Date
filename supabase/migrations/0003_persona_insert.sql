-- Lets a signed-in user save new versions of their own persona card
-- (the Persona Builder runs with the user's own login).
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
create policy "own persona: insert" on public.persona_cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
