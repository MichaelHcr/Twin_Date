import type { SupabaseClient } from "@supabase/supabase-js";

// Profile photos live in the private "photos" Storage bucket (migration 0006), at
// <user_id>/<random>.<ext>. profiles.photos holds those paths in display order;
// the first one is the main photo. Twins never see photos.

export const PHOTO_BUCKET = "photos";
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Signed URLs for display, one per path in the same order (null if a file is
// missing). They expire after an hour; pages are rendered per request, so each
// visit gets fresh ones. Use the user's own client for their own photos, and the
// admin client only for people they're connected with.
export async function signPhotoUrls(client: SupabaseClient, paths: string[]) {
  if (paths.length === 0) return [];
  const { data } = await client.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => byPath.get(p) ?? null);
}
