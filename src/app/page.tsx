import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "./home-dashboard";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-16 text-center font-sans sm:py-20 dark:bg-black">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
        Your AI twin goes on the first chat for you.
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Then it hands you a shortlist of people worth meeting.
      </p>
      {/* The page shell is static; only the login status is per-visitor. */}
      <Suspense fallback={<div className="h-9" />}>
        <AuthStatus />
      </Suspense>
    </main>
  );
}

async function AuthStatus() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/login?mode=signup"
          className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-black dark:border-zinc-700 dark:text-zinc-50"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_complete")
    .eq("user_id", user.id)
    .single();

  // Once onboarding is done, home is Matches and Connections. Profile, twin and
  // sign-out live in the account menu at the top right.
  if (profile?.onboarding_complete) return <HomeDashboard supabase={supabase} userId={user.id} />;

  // Still setting up: the next step of onboarding.
  const next = !profile?.display_name
    ? { href: "/onboarding/profile", label: "Build your profile" }
    : { href: "/onboarding/interview", label: "Continue your interview" };

  return (
    <div className="flex flex-col items-center gap-3">
      <Link
        href={next.href}
        className="rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        {next.label}
      </Link>
      <p className="text-sm text-zinc-500">Signed in as {user.email}</p>
      <form action="/auth/signout" method="post">
        <button className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          Sign out
        </button>
      </form>
    </div>
  );
}
