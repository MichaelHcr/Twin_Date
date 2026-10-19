"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Decision } from "@/lib/decisions";
import { decide } from "./[id]/decision-actions";

// The round Pass / Read / Yes buttons under a match card, like Hinge or Bumble.
// After a choice the page refreshes and the next waiting match comes up.
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

  const round =
    "flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50";
  const outline = `${round} border border-zinc-300 bg-white text-zinc-600 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300`;

  return (
    <div className="pb-5 pt-5">
      <div className="flex items-center justify-center gap-5">
        {canPass && (
          <button onClick={() => choose("pass")} disabled={pending} aria-label="Pass" className={`${outline} h-[72px] w-[72px]`}>
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <Link href={`/matches/${conversationId}`} aria-label="Read the twins' chat" className={`${outline} h-[60px] w-[60px]`}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path d="M3 20l1.3-3.9A8 8 0 1 1 7.9 19.7L3 20z" strokeLinejoin="round" />
          </svg>
        </Link>
        <button
          onClick={() => choose(yes)}
          disabled={pending}
          aria-label={yesLabel}
          className={`${round} h-[72px] w-[72px] bg-brand text-white hover:bg-brand-hover`}
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path
              d="M12 20s-7-4.3-8.9-8.6C1.7 8.2 3.6 4.8 7 4.8c2 0 3.3 1.1 5 2.9 1.7-1.8 3-2.9 5-2.9 3.4 0 5.3 3.4 3.9 6.6C19 15.7 12 20 12 20z"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-zinc-500">
        {[canPass ? "Pass" : null, "Read the twins' chat", yesLabel].filter(Boolean).join(" · ")}
      </p>
      {error && <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
