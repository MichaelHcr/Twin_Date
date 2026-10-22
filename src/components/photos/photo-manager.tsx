"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_BUCKET, PHOTO_TYPES } from "@/lib/photos";
import { addPhoto, makeMainPhoto, removePhoto } from "./actions";

export type OwnPhoto = { path: string; url: string };

// Upload, reorder and delete your own photos. Files go straight from the browser
// to your folder in Storage; the server action then adds the path to your profile.
export function PhotoManager({ userId, photos }: { userId: string; photos: OwnPhoto[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;

  async function upload(file: File) {
    setError(null);
    const ext = PHOTO_TYPES[file.type];
    if (!ext) return setError("Use a JPEG, PNG or WebP image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("That photo is over 5 MB. Try a smaller one.");

    setUploading(true);
    try {
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(uploadError.message);
      const result = await addPhoto(path);
      if (result) throw new Error(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  function run(action: () => Promise<{ error: string } | null>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result) setError(result.error);
    });
  }

  return (
    <div className="mt-6">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.path} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            {/* Signed Storage URLs change on every visit, so a plain img is simpler than next/image here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={i === 0 ? "Your main photo" : `Your photo ${i + 1}`} className="aspect-[4/5] w-full object-cover" />
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              {i === 0 ? (
                <span className="font-medium text-green-700 dark:text-green-400">Main photo</span>
              ) : (
                <button onClick={() => run(() => makeMainPhoto(p.path))} disabled={busy} className="font-medium hover:underline disabled:opacity-50">
                  Make main
                </button>
              )}
              <button onClick={() => run(() => removePhoto(p.path))} disabled={busy} className="text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {photos.length < MAX_PHOTOS && (
        <label className={`mt-4 inline-block cursor-pointer rounded-full bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 px-5 py-2 text-sm font-medium text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {uploading ? "Uploading…" : photos.length === 0 ? "Add your first photo" : "Add a photo"}
          <input
            ref={input}
            type="file"
            accept={Object.keys(PHOTO_TYPES).join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </label>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        Up to {MAX_PHOTOS} photos, JPEG, PNG or WebP, 5 MB each.
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
