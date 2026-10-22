import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { OwnPhotos } from "@/components/photos/own-photos";
import { requireUser } from "@/lib/auth";
import { ageOf } from "@/lib/decisions";
import { MAX_PHOTOS, signPhotoUrls } from "@/lib/photos";
import { GOALS, TOPICS } from "@/lib/profile-topics";
import { InterviewReview } from "./interview-review";
import { ProfileForm } from "./profile-form";

export default function ProfilePage() {
  return (
    <main className="flex flex-1 justify-center px-4 py-12 font-sans">
      <div className="w-full max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your profile
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Your twin uses exactly what you enter here to represent you. Your interview
          only teaches it how you talk, and never changes these answers.
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
  const photos = (p?.photos ?? []) as string[];
  const [mainPhoto = null] = await signPhotoUrls(supabase, photos.slice(0, 1));

  return (
    <>
      <ProfileHero
        name={p?.display_name ?? ""}
        age={ageOf(p?.birthdate ?? null)}
        city={p?.city ?? null}
        goal={GOALS.find((g) => g.value === p?.goal)?.label ?? null}
        photoUrl={mainPhoto}
        photoCount={photos.length}
        interviewDone={Boolean(p?.onboarding_complete)}
      />

      <Suspense
        fallback={<p className="mt-6 text-sm text-zinc-500">Comparing your interview with your profile…</p>}
      >
        <InterviewReview />
      </Suspense>

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Photos</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Hidden from everyone, including your twin, until you and a match both say yes.
          Photos save as soon as you add them.
        </p>
        <OwnPhotos />
      </section>

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
          // A free-response topic left empty after a save was skipped on purpose.
          skipped: p?.display_name ? TOPICS.filter((t) => !t.options && !answers[t.key]).map((t) => t.key) : [],
        }}
      />
    </>
  );
}

// The card at the top: how others will see you once you match, and what's left to do.
function ProfileHero({
  name,
  age,
  city,
  goal,
  photoUrl,
  photoCount,
  interviewDone,
}: {
  name: string;
  age: number | null;
  city: string | null;
  goal: string | null;
  photoUrl: string | null;
  photoCount: number;
  interviewDone: boolean;
}) {
  const chip = "rounded-full px-3 py-1 text-xs font-medium";
  return (
    <section className="mt-8 flex flex-col items-center gap-5 rounded-3xl border border-zinc-200 bg-white p-6 text-center sm:flex-row sm:text-left dark:border-zinc-800 dark:bg-zinc-950">
      <Avatar name={name || "?"} url={photoUrl} className="h-28 w-28 text-4xl ring-4 ring-zinc-100 dark:ring-zinc-900" />
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          {name || "Your name"}
          {age !== null && <span className="font-normal text-zinc-500">, {age}</span>}
        </p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          {[city, goal].filter(Boolean).join(" · ") || "Fill in the basics below."}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <span
            className={`${chip} ${
              photoCount > 0
                ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {photoCount > 0 ? `${photoCount}/${MAX_PHOTOS} photos` : "No photos yet"}
          </span>
          {interviewDone ? (
            <>
              <span className={`${chip} bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300`}>
                ✓ Twin ready
              </span>
              <Link href="/twin" className={`${chip} bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 text-white`}>
                Talk to your twin →
              </Link>
            </>
          ) : (
            name && (
              <Link href="/onboarding/interview" className={`${chip} bg-amber-100 text-amber-800 hover:underline dark:bg-amber-950 dark:text-amber-300`}>
                Finish your interview →
              </Link>
            )
          )}
        </div>
      </div>
    </section>
  );
}
