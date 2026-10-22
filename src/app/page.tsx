import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "./home-dashboard";
import { Landing } from "./landing";

export default function Home() {
  // Signed-out visitors get the landing page, everyone else their home, so the
  // whole page waits on the login status.
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <Landing />;

  return (
    <main className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-16 text-center font-sans sm:py-20 dark:bg-black">
      <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-black sm:text-5xl dark:text-zinc-50">
        Your AI twin goes on the first chat for you.
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Then it hands you a shortlist of people worth meeting.
      </p>
      <SignedInHome supabase={supabase} userId={user.id} email={user.email} />
    </main>
  );
}

async function SignedInHome({
  supabase,
  userId,
  email,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | undefined;
}) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_complete")
    .eq("user_id", userId)
    .single();

  // Once onboarding is done, home is Matches and Connections. Profile, twin and
  // sign-out live in the account menu at the top right.
  if (profile?.onboarding_complete) return <HomeDashboard supabase={supabase} userId={userId} />;

  // Still setting up: the next step of onboarding.
  const next = !profile?.display_name
    ? { href: "/onboarding/profile", label: "Build your profile" }
    : { href: "/onboarding/interview", label: "Continue your interview" };

  return (
    <div className="flex flex-col items-center gap-3">
      <Link
        href={next.href}
        className="rounded-full bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 px-5 py-2 text-sm font-medium text-white"
      >
        {next.label}
      </Link>
      <p className="text-sm text-zinc-500">Signed in as {email}</p>
      <form action="/auth/signout" method="post">
        <button className="rounded-full border border-zinc-300 px-4 py-1 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
          Sign out
        </button>
      </form>
    </div>
  );
}
