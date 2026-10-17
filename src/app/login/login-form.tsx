"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(searchParams.get("error"));

  const redirectTo = () => `${window.location.origin}/auth/callback`;

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function signInWithGoogle() {
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-24 font-sans dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Sign in to Twin Date
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          New here? Signing in creates your account.
        </p>

        {status === "sent" ? (
          <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            Check {email} for a sign-in link. Open it in this same browser.
          </p>
        ) : (
          <>
            <label className="mt-6 flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                className="mt-0.5"
              />
              I confirm I am 18 or older.
            </label>

            <form onSubmit={sendMagicLink} className="mt-4 flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                disabled={!isAdult || status === "sending"}
                className="rounded-lg bg-black px-3 py-2 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {status === "sending" ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>

            <div className="my-4 text-center text-xs text-zinc-400">or</div>

            <button
              onClick={signInWithGoogle}
              disabled={!isAdult}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
            >
              Continue with Google
            </button>
          </>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </main>
  );
}
