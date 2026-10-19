"use client";

import { useState, useTransition } from "react";
import type { Decision } from "@/lib/decisions";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";
import { decide } from "./decision-actions";

export type DecisionOption = { decision: Decision; label: string; primary?: boolean };

// The Yes / Pass / request buttons under a match report. The server action saves
// the choice and refreshes the page, which then shows the new state.
export function DecisionButtons({
  conversationId,
  options,
  className = "mt-4",
}: {
  conversationId: string;
  options: DecisionOption[];
  className?: string;
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

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.decision}
            onClick={() => choose(o.decision)}
            disabled={pending}
            className={o.primary ? BTN_PRIMARY : BTN_SECONDARY}
          >
            {o.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
