"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Decision } from "@/lib/decisions";
import { decide } from "./[id]/decision-actions";

// The round Pass / Read / Yes buttons under a match card, like Hinge or Bumble.
// After a choice the page refreshes and the next waiting match slides in.
export function DeckActions({
  conversationId,
  yes,
  yesLabel,
  canPass,
}: {
  conversationId: string;
  yes: Decision;
  yesLabel: string;
  canPass: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(decision: Decision) {
    setError(null);
    startTransition(async () => {
      const result = await decide(conversationId, decision);
      if (result) setError(result.error);
    });
  }

  const round = "flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50";
  return (
    <div className="mt-5">
      <div className="flex items-center justify-center gap-6">
        {canPass && (
          <button
            onClick={() => choose("pass")}
            disabled={pending}
            aria-label="Pass"
            className={`${round} h-16 w-16 border border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Link
          href={`/matches/${conversationId}`}
          aria-label="Read the twins' chat"
          className={`${round} h-12 w-12 border border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" />
          </svg>
        </Link>
        <button
          onClick={() => choose(yes)}
          disabled={pending}
          aria-label={yesLabel}
          className={`${round} h-16 w-16 bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg shadow-rose-500/30 hover:brightness-110`}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-6 text-xs font-medium text-zinc-500">
        {canPass && <span className="w-16 text-center">Pass</span>}
        <span className="w-12 text-center">Chat</span>
        <span className="w-16 text-center">{yesLabel}</span>
      </div>
      {error && <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
