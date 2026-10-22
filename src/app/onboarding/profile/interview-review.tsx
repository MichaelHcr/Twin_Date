import { loadProfileCheck } from "@/lib/agents/profile-checker";
import { requireUser } from "@/lib/auth";
import { TOPICS } from "@/lib/profile-topics";
import { dismissConflict } from "./actions";

const CARD = "mt-6 rounded-2xl border p-6";

// What the interview picked up, kept apart from the profile form, plus a warning
// for each place where the interview contradicts the form. Re-checks with Claude
// when the form or the interview changed, so it sits in its own Suspense.
export async function InterviewReview() {
  const { supabase, user } = await requireUser();
  let check;
  try {
    check = await loadProfileCheck(supabase, user.id);
  } catch (error) {
    console.error("Profile check failed:", error);
    return (
      <p className={`${CARD} border-zinc-200 bg-white text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950`}>
        Couldn&apos;t compare your interview with your profile right now. Reload the page to try again.
      </p>
    );
  }
  if (!check) return null;

  const { data: facts } = await supabase
    .from("interview_facts")
    .select("topic, answer")
    .eq("user_id", user.id)
    .order("topic");
  const label = (topic: string) =>
    TOPICS.find((t) => t.key === topic)?.label ?? topic.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const open = check.conflicts.map((c, i) => ({ ...c, i })).filter((c) => !c.dismissed);

  return (
    <>
      {open.length > 0 && (
        <section className={`${CARD} border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950`}>
          <h2 className="font-semibold text-amber-900 dark:text-amber-200">
            {open.length === 1 ? "1 answer to review" : `${open.length} answers to review`}
          </h2>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
            What you said in your interview doesn&apos;t match your profile. Your twin follows your profile, so
            fix whichever one is wrong.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {open.map((c) => (
              <li key={c.i} className="rounded-xl bg-white p-4 text-sm dark:bg-zinc-950">
                <p className="font-medium text-black dark:text-zinc-50">{label(c.topic)}</p>
                <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500">Profile:</span> {c.profile_says}
                </p>
                <p className="text-zinc-700 dark:text-zinc-300">
                  <span className="text-zinc-500">Interview:</span> “{c.interview_says}”
                </p>
                <p className="mt-1 text-zinc-500">{c.note}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={`#topic-${c.topic}`}
                    className="rounded-full bg-linear-to-r from-pink-500 to-violet-600 shadow-md shadow-pink-500/20 hover:brightness-110 px-4 py-1.5 font-medium text-white"
                  >
                    Update my profile
                  </a>
                  <form action={dismissConflict.bind(null, c.i)}>
                    <button className="rounded-full border border-zinc-300 px-4 py-1.5 font-medium text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900">
                      My profile is right
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950`}>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">From your interview</h2>
        <p className="mt-1 text-sm text-zinc-500">
          An AI summary of your interview. It never changes your profile answers below.
        </p>
        <p className="mt-3 leading-7 text-zinc-800 dark:text-zinc-200">{check.summary}</p>
        {(facts ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {(facts ?? []).map((f) => (
              <li key={f.topic}>
                <span className="font-medium text-black dark:text-zinc-50">{label(f.topic)}:</span>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">{f.answer}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
