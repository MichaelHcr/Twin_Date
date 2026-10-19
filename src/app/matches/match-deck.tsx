import type { SupabaseClient } from "@supabase/supabase-js";
import { ageOf, wantsToMeet, type Decision, type DecisionState } from "@/lib/decisions";
import { END_REASON_LABELS, scoreColor } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeckActions } from "./deck-actions";

export type DeckItem = {
  id: string;
  user_a: string;
  user_b: string;
  end_reason: string | null;
  state: DecisionState;
};

type Evidence = { speaker: "a" | "b"; quote: string; why: string };

// Still waiting on this user's answer: nothing decided yet, or they sent a
// request this user hasn't accepted.
export const needsAnswer = (s: DecisionState) =>
  !s.connected && !wantsToMeet(s.mine) && (s.mine === null || s.theyRequested);

// One match at a time, like a dating app: the report up front, Pass / Yes below.
// Identities stay hidden; the card shows only their age and what the twins found.
export async function MatchDeck({
  supabase,
  userId,
  waiting,
}: {
  supabase: SupabaseClient;
  userId: string;
  waiting: DeckItem[];
}) {
  const top = waiting[0];
  if (!top) return null;
  const mySide = top.user_a === userId ? "a" : "b";
  const otherId = mySide === "a" ? top.user_b : top.user_a;

  const [{ data: report }, { data: other }] = await Promise.all([
    supabase
      .from("reports")
      .select("score, summary, evidence_json, red_flags, questions_to_ask")
      .eq("conversation_id", top.id)
      .single(),
    // Age only: names, photos and cities stay hidden until both say yes.
    createAdminClient().from("profiles").select("birthdate").eq("user_id", otherId).single(),
  ]);
  if (!report) return null;

  const theirQuotes = ((report.evidence_json ?? []) as Evidence[]).filter((e) => e.speaker !== mySide).slice(0, 2);
  const redFlags = (report.red_flags ?? []) as string[];
  const toAsk = ((report.questions_to_ask ?? []) as string[]).slice(0, 2);
  const age = ageOf(other?.birthdate ?? null);

  let yes: Decision = "yes";
  let yesLabel = "Yes";
  let note: string | null = null;
  if (top.state.theyRequested) {
    yesLabel = "Accept";
    note = "They read this report and sent you a connection request.";
  } else if (top.end_reason === "red_flag") {
    yes = "request";
    yesLabel = "Connect";
    note = "This chat ended on a dealbreaker. You can still ask to connect.";
  }

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Waiting for you</h2>
        <span className="text-sm text-zinc-500">
          {waiting.length === 1 ? "Last one" : `1 of ${waiting.length}`}
        </span>
      </div>

      <div className="relative mt-3">
        {/* The next cards peek out underneath, like a deck. */}
        {waiting.length > 1 && (
          <div className="absolute inset-x-4 -bottom-2 h-full rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
        )}
        {waiting.length > 2 && (
          <div className="absolute inset-x-8 -bottom-4 h-full rounded-3xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" />
        )}

        <article className="relative rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {note && (
            <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {note}
            </p>
          )}
          <div className="flex items-center gap-4">
            <span
              className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-semibold ring-4 ring-rose-100 dark:ring-rose-950 ${scoreColor(report.score)}`}
            >
              {report.score}
            </span>
            <div>
              <p className="text-xl font-semibold text-black dark:text-zinc-50">
                Your match{age !== null && <span className="font-normal text-zinc-500">, {age}</span>}
              </p>
              <p className="text-sm text-zinc-500">
                {top.end_reason ? END_REASON_LABELS[top.end_reason] : "First chat done"}
              </p>
            </div>
          </div>

          <p className="mt-4 leading-7 text-zinc-800 dark:text-zinc-200">{report.summary}</p>

          {theirQuotes.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {theirQuotes.map((q) => (
                <li
                  key={q.quote}
                  className="rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-2 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  “{q.quote}”
                </li>
              ))}
            </ul>
          )}

          {(redFlags.length > 0 || toAsk.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {redFlags.map((f) => (
                <span key={f} className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                  {f}
                </span>
              ))}
              {toAsk.map((q) => (
                <span key={q} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Ask: {q}
                </span>
              ))}
            </div>
          )}

          <DeckActions
            conversationId={top.id}
            yes={yes}
            yesLabel={yesLabel}
            canPass={top.state.mine !== "pass"}
          />
        </article>
      </div>
      <p className="mt-6 text-center text-xs text-zinc-500">
        Your answer stays private. If you both say yes, you&apos;ll see each other&apos;s name and photos.
      </p>
    </section>
  );
}
