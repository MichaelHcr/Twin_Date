"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshPages } from "@/app/actions";
import { BTN_PRIMARY } from "@/lib/ui";

// Asks the Scout for the next match, then opens the page where the twins chat.
export function FindMatchButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  async function find() {
    setPending(true);
    setError(null);
    setUpgrade(false);
    try {
      const res = await fetch("/api/matches/find", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setUpgrade(Boolean(data.upgrade));
        throw new Error(data.error ?? "Something went wrong.");
      }
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
        className={BTN_PRIMARY}
      >
        {pending ? "Finding someone…" : "Find my next match"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}{" "}
          {upgrade && (
            <Link href="/pricing" className="font-medium underline">
              Upgrade for more
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
