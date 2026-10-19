-- Profile photos (PRD: profiles.photos, revealed only after a mutual yes).
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- The bucket is private. Each user can upload, see and delete only the files in
-- their own folder (photos/<user_id>/...). Other people's photos are shown only
-- through short-lived signed URLs that server code creates after checking that
-- the two are connected (src/lib/decisions.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "own photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own photos: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
