"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { refreshPages } from "@/app/actions";

// Asks the Scout for the next match, then opens the page where the twins chat.
export function FindMatchButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function find() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/matches/find", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      await refreshPages();
      router.push(`/matches/${data.conversationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        onClick={find}
        disabled={pending}
        className="rounded-full bg-black px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        {pending ? "Finding someone…" : "Find my next match"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
