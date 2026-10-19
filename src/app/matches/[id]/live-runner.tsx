"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshPages } from "@/app/actions";

// Drives an unfinished conversation while the page is open: one request per twin
// turn, then one for the Judge's report. The page re-renders after each step, so
// new messages appear as they're written.
export function LiveRunner({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"chatting" | "judging">("chatting");
  const running = useRef(false);

  useEffect(() => {
    if (running.current) return;
    running.current = true;
    let cancelled = false;

    (async () => {
      try {
        while (!cancelled) {
          const res = await fetch(`/api/conversations/${conversationId}/step`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
          await refreshPages();
          router.refresh();
          if (data.reported) break;
          if (data.ended) setPhase("judging");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        running.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, router, attempt]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm dark:border-red-900 dark:bg-zinc-950">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setAttempt((a) => a + 1);
          }}
          className="mt-2 font-medium underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      {phase === "chatting"
        ? "Your twin is chatting now. Keep this page open; new messages appear as they're sent."
        : "The chat is over. Writing your report…"}
    </p>
  );
}
