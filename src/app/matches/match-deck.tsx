import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureMatchCard, type MatchCard } from "@/lib/agents/match-card";
import { ageOf, wantsToMeet, type Decision, type DecisionState } from "@/lib/decisions";
import { GOALS, TOPICS } from "@/lib/profile-topics";
import { createAdminClient } from "@/lib/supabase/admin";
import { CARD, CHIP_ALIGNED, CHIP_ASK, CHIP_FLAG, PANEL, TITLE, TWIN_NOTE } from "@/lib/ui";
import { FindMatchButton } from "./find-button";
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

// Topics with set answers, where the same answer on both sides is worth a tag.
const ALIGNABLE = ["kids", "smoking", "relocation"];
const SHORT_GOALS: Record<string, string> = { long_term: "long-term", short_term: "short-term", open: "open to either" };

// One match at a time, like a dating app: the twins' report up front, then
// Pass / Read / Yes. Names and photos stay hidden until both say yes.
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

  const header = (
    <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
      <h1 className={TITLE}>Matches</h1>
      {top && <span className="text-sm text-zinc-500">1 of {waiting.length} waiting</span>}
    </div>
  );

  if (!top) {
    return (
      <section className={CARD}>
        {header}
        <div className="px-5 pb-6 text-center">
          <p className="font-semibold text-black dark:text-zinc-50">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-zinc-500">Send your twin on a first chat to meet someone new.</p>
          <div className="mt-5 flex justify-center">
            <FindMatchButton />
          </div>
        </div>
      </section>
    );
  }

  const mySide = top.user_a === userId ? "a" : "b";
  const otherId = mySide === "a" ? top.user_b : top.user_a;
  const admin = createAdminClient();

  const [{ data: report }, { data: other }, { data: answers }, card] = await Promise.all([
    supabase
      .from("reports")
      .select("summary, score, evidence_json, red_flags, questions_to_ask")
      .eq("conversation_id", top.id)
      .single(),
    // Age, city and goal only: names and photos stay hidden until both say yes.
    admin.from("profiles").select("birthdate, city, goal").eq("user_id", otherId).single(),
    // Only compared here to say "aligned"; the answers themselves aren't shown.
    admin.from("profile_answers").select("user_id, topic, answer").in("user_id", [userId, otherId]).in("topic", ALIGNABLE),
    // The short card version of the report; null falls back to the report's own text.
    ensureMatchCard(admin, top.id).catch((): MatchCard | null => null),
  ]);
  if (!report) return null;

  const answerOf = (uid: string, topic: string) =>
    (answers ?? []).find((a) => a.user_id === uid && a.topic === topic)?.answer?.trim().toLowerCase();
  const aligned = ALIGNABLE.filter((t) => {
    const mine = answerOf(userId, t);
    return mine && mine !== "not sure yet" && mine === answerOf(otherId, t);
  }).map((t) => `${TOPICS.find((x) => x.key === t)?.label ?? t}: aligned`);

  // Their shortest quoted line reads best on a card.
  const quote = ((report.evidence_json ?? []) as Evidence[])
    .filter((e) => e.speaker !== mySide)
    .sort((x, y) => x.quote.length - y.quote.length)[0];
  const firstSentence = report.summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? report.summary;
  const headline = card?.headline ?? firstSentence;
  const chipFor = { aligned: CHIP_ALIGNED, ask: CHIP_ASK, flag: CHIP_FLAG } as const;
  const tags = card
    ? card.tags.map((t) => ({ label: t.label, tone: chipFor[t.kind] }))
    : [
        ...aligned.map((label) => ({ label, tone: CHIP_ALIGNED })),
        ...((report.red_flags ?? []) as string[]).map((label) => ({ label, tone: CHIP_FLAG })),
        ...((report.questions_to_ask ?? []) as string[]).slice(0, 1).map((q) => ({ label: `Ask: ${q}`, tone: CHIP_ASK })),
      ];
  const age = ageOf(other?.birthdate ?? null);
  const goal = other?.goal ? (SHORT_GOALS[other.goal] ?? GOALS.find((g) => g.value === other.goal)?.label) : null;

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
    <section className={CARD}>
      {header}
      <div className="px-5">
        {note && <p className={`${TWIN_NOTE} mb-3`}>{note}</p>}
        <div className={`${PANEL} p-5`}>
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[3px] border-brand text-3xl font-medium text-brand-ink dark:text-pink-300">
              {report.score}
            </span>
            <div className="min-w-0">
              <p className="text-xl font-semibold text-black dark:text-zinc-50">
                Member {mySide === "a" ? "B" : "A"}
                {age !== null && `, ${age}`}
              </p>
              <p className="text-zinc-500">{[other?.city, goal].filter(Boolean).join(" · ")}</p>
            </div>
          </div>

          <p className="mt-4 text-lg leading-7 text-zinc-800 dark:text-zinc-200">{headline}</p>

          {quote && (
            <p className="mt-3 border-l-2 border-pink-300 pl-3 text-zinc-700 dark:border-pink-800 dark:text-zinc-300">
              “{quote.quote}”
            </p>
          )}

          {tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span key={t.label} className={`${t.tone} max-w-full truncate text-sm`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <DeckActions conversationId={top.id} yes={yes} yesLabel={yesLabel} canPass={top.state.mine !== "pass"} />
      </div>
    </section>
  );
}
