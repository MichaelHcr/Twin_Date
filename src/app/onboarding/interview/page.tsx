import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Chat } from "./chat";

export default function InterviewPage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-12 font-sans">
      <div className="flex w-full max-w-xl flex-col">
        <p className="text-sm text-zinc-500">Step 2 of 2</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Meet your interviewer
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          A short, casual chat so your twin learns how you talk. Answer the way you&apos;d text a friend.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <InterviewLoader />
        </Suspense>
      </div>
    </main>
  );
}

async function InterviewLoader() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_complete")
    .eq("user_id", user.id)
    .single();
  if (!profile?.display_name) redirect("/onboarding/profile");

  if (profile.onboarding_complete) redirect("/twin");

  const { data: rows } = await supabase
    .from("interview_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("id", { ascending: true });

  return <Chat initialMessages={rows ?? []} />;
}
