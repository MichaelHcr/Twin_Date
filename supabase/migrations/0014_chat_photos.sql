-- Photos in the real chat. Run 0013_chat_topics.sql first.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Files go in the private "chat-photos" bucket at <conversation_id>/<uuid>.<ext>.
-- Only the two people in a connected chat can upload to or see its folder; the
-- app shows them through short-lived signed URLs.

-- A message can now be a photo, with or without text.
alter table public.chat_messages add column if not exists image_path text;
alter table public.chat_messages drop constraint if exists chat_messages_content_check;
alter table public.chat_messages add constraint chat_messages_content_check check (
  char_length(content) <= 2000
  and (char_length(content) >= 1 or image_path is not null)
);
-- The photo must sit in this chat's own folder.
alter table public.chat_messages drop constraint if exists chat_messages_image_in_chat;
alter table public.chat_messages add constraint chat_messages_image_in_chat check (
  image_path is null or image_path like conversation_id::text || '/%'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- True when a storage folder name is a conversation the signed-in user is
-- connected in. CASE makes sure a folder that isn't a uuid is never cast.
create or replace function public.chat_folder_ok(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_connected(folder::uuid)
    else false
  end;
$$;

create policy "connected: upload chat photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-photos' and public.chat_folder_ok((storage.foldername(name))[1]));

create policy "connected: see chat photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-photos' and public.chat_folder_ok((storage.foldername(name))[1]));
