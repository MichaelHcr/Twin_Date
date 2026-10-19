import { requireUser } from "@/lib/auth";
import { signPhotoUrls } from "@/lib/photos";
import { PhotoManager } from "./photo-manager";

// The signed-in user's photo manager, shown on the profile page.
// Wrap it in <Suspense>: it reads the session and the database.
export async function OwnPhotos() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("photos").eq("user_id", user.id).single();
  const paths = (data?.photos ?? []) as string[];
  // Your own client can sign your own files (migration 0006 policies).
  const urls = await signPhotoUrls(supabase, paths);
  const photos = paths.flatMap((path, i) => (urls[i] ? [{ path, url: urls[i] }] : []));
  return <PhotoManager userId={user.id} photos={photos} />;
}
