"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from "@/lib/ui";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    title: "Welcome back",
    subtitle: "Sign in to see your matches.",
    email: "Email me a sign-in link",
    google: "Sign in with Google",
  },
  signup: {
    title: "Create your account",
    subtitle: "Build your AI twin and let it take the first chat.",
    email: "Email me a sign-up link",
    google: "Sign up with Google",
  },
} as const;

export function LoginForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [isAdult, setIsAdult] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState(searchParams.get("error"));
  // Signing in with an email that has no account yet offers to create one.
  const [noAccount, setNoAccount] = useState(false);

  const copy = COPY[mode];
  // The 18+ confirmation is asked only when creating an account. The profile
  // form checks the birthdate as well, so a Google sign-in can't skip it.
  const blocked = mode === "signup" && !isAdult;
  const redirectTo = () => `${window.location.origin}/auth/callback`;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNoAccount(false);
    setStatus("idle");
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    setStatus("sending");
    setError(null);
    setNoAccount(false);
    const { error } = await createClient().auth.signInWithOtp({
      email,
      // Sign in only reaches existing accounts; sign up creates one.
      options: { emailRedirectTo: redirectTo(), shouldCreateUser: mode === "signup" },
    });
    if (!error) {
      setStatus("sent");
      return;
    }
    setStatus("idle");
    if (mode === "signin" && /signups not allowed/i.test(error.message)) setNoAccount(true);
    else setError(error.message);
  }

  async function continueWithGoogle() {
    if (blocked) return;
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <div className={`${CARD} w-full max-w-sm p-6 sm:p-8`}>
        <div role="tablist" className="grid grid-cols-2 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`rounded-full py-2 text-sm font-semibold transition ${
                mode === m
                  ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-black dark:hover:text-zinc-50"
              }`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">{copy.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{copy.subtitle}</p>

        {status === "sent" ? (
          <div className="mt-6 rounded-xl bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            <p>
              Check <span className="font-semibold">{email}</span> for a link. Open it in this same browser.
            </p>
            <button onClick={() => setStatus("idle")} className="mt-2 text-xs font-semibold underline">
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <button onClick={continueWithGoogle} disabled={blocked} className={`${BTN_SECONDARY} mt-6 w-full gap-3`}>
              <GoogleLogo />
              {copy.google}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              or with email
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              {mode === "signup" && (
                <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isAdult}
                    onChange={(e) => setIsAdult(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-violet-600"
                  />
                  I confirm I am 18 or older.
                </label>
              )}
              <button type="submit" disabled={blocked || status === "sending"} className={`${BTN_PRIMARY} w-full`}>
                {status === "sending" ? "Sending…" : copy.email}
              </button>
            </form>

            {blocked && (
              <p className="mt-3 text-center text-xs text-zinc-500">Confirm you&apos;re 18 or older to continue.</p>
            )}
          </>
        )}

        {noAccount && (
          <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
            There&apos;s no account for this email yet.{" "}
            <button onClick={() => switchMode("signup")} className="font-semibold underline">
              Sign up instead
            </button>
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <p className="mt-6 text-center text-sm text-zinc-500">
          {mode === "signin" ? "New to Twin Date? " : "Already have an account? "}
          <button
            onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold text-black underline-offset-2 hover:underline dark:text-zinc-50"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}

// Google's multicolor "G", as its sign-in branding guidelines ask for.
function GoogleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
