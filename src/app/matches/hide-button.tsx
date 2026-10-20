"use client";

import { useState, useTransition } from "react";
import { hideMatch } from "./actions";

// "Hide" on a passed match: removes it from your list, keeps the data.
export function HideButton({ conversationId }: { conversationId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await hideMatch(conversationId);
            setError(result?.error ?? null);
          })
        }
        disabled={pending}
        className="rounded-full px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-black disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
      >
        {pending ? "Hiding…" : "Hide"}
      </button>
      {error && <span className="max-w-40 text-right text-xs text-red-600">{error}</span>}
    </span>
  );
}
