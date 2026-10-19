"use client";

import { useState } from "react";

// Both buttons ask our server for a Stripe page and then leave the site for it.
function useStripeRedirect(endpoint: string) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(body?: object) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Something went wrong.");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return { pending, error, go };
}

export function CheckoutButton({ tier, label }: { tier: "plus" | "pro"; label: string }) {
  const { pending, error, go } = useStripeRedirect("/api/stripe/checkout");
  return (
    <div>
      <button
        onClick={() => go({ tier })}
        disabled={pending}
        className="w-full rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Opening checkout…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const { pending, error, go } = useStripeRedirect("/api/stripe/portal");
  return (
    <div>
      <button
        onClick={() => go()}
        disabled={pending}
        className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
      >
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
