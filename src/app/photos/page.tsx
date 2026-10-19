import { Suspense } from "react";
import Link from "next/link";
import { OwnPhotos } from "./own-photos";

// Your own photos. Nobody else sees them until you both say yes to a match.
export default function PhotosPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <Link href="/matches" className="text-sm text-zinc-500 hover:underline">
          ← Your matches
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your photos
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Hidden from everyone, including twins, until you and a match both say yes.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <OwnPhotos />
        </Suspense>
      </div>
    </main>
  );
}
