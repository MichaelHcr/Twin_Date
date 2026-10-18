import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { TOPICS } from "@/lib/profile-topics";
import { ProfileForm } from "./profile-form";

export default function ProfilePage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your profile
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Your twin uses this to represent you. Anything you skip, your twin&apos;s
          interviewer will ask about.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <ProfileLoader />
        </Suspense>
      </div>
    </main>
  );
}

async function ProfileLoader() {
  const { supabase, user } = await requireUser();

  const [{ data: p }, { data: answerRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).single(),
    supabase.from("profile_answers").select("topic, answer").eq("user_id", user.id),
  ]);
  const answers = Object.fromEntries((answerRows ?? []).map((a) => [a.topic, a.answer]));

  return (
    <ProfileForm
      initial={{
        display_name: p?.display_name ?? "",
        birthdate: p?.birthdate ?? "",
        gender: p?.gender ?? "",
        city: p?.city ?? "",
        seeking: p?.seeking ?? [],
        age_min: String(p?.age_min ?? 21),
        age_max: String(p?.age_max ?? 35),
        radius_km: String(p?.radius_km ?? 50),
        goal: p?.goal ?? "",
        topics: Object.fromEntries(TOPICS.map((t) => [t.key, answers[t.key] ?? ""])),
      }}
    />
  );
}
