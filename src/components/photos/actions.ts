"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MAX_PHOTOS, PHOTO_BUCKET } from "@/lib/photos";

type Result = { error: string } | null;

async function loadPhotos() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("photos").eq("user_id", user.id).single();
  return { supabase, user, photos: (data?.photos ?? []) as string[] };
}

async function savePhotos(photos: string[]): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ photos }).eq("user_id", user.id);
  if (error) return { error: `Couldn't save your photos: ${error.message}` };
  revalidatePath("/", "layout");
  return null;
}

// Records a photo the browser just uploaded to the user's own folder.
export async function addPhoto(path: string): Promise<Result> {
  const { supabase, user, photos } = await loadPhotos();
  const match = new RegExp(`^${user.id}/([0-9a-f-]{36}\\.(?:jpg|png|webp))$`).exec(path);
  if (!match) return { error: "That upload isn't in your photo folder." };
  if (photos.includes(path)) return null;
  if (photos.length >= MAX_PHOTOS) return { error: `You can have up to ${MAX_PHOTOS} photos.` };

  // Make sure the file really was uploaded before pointing the profile at it.
  const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(user.id, { search: match[1] });
  if (!files?.some((f) => f.name === match[1])) return { error: "The upload didn't finish. Try again." };

  return savePhotos([...photos, path]);
}

// Removes a photo from the profile and deletes the file.
export async function removePhoto(path: string): Promise<Result> {
  const { supabase, photos } = await loadPhotos();
  if (!photos.includes(path)) return null;
  const result = await savePhotos(photos.filter((p) => p !== path));
  if (result) return result;
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  return null;
}

// Moves a photo to the front, which makes it the main photo.
export async function makeMainPhoto(path: string): Promise<Result> {
  const { photos } = await loadPhotos();
  if (!photos.includes(path)) return { error: "Photo not found." };
  return savePhotos([path, ...photos.filter((p) => p !== path)]);
}
