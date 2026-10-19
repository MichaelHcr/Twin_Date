import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, NO_DECISION, wantsToMeet, type Decision, type DecisionState } from "@/lib/decisions";
import { single } from "@/lib/matches";
import { CARD, COLUMN, LABEL, PAGE, TWIN_NOTE } from "@/lib/ui";
import { DeckActions } from "./deck-actions";
import { FindMatchButton } from "./find-button";
import { loadMatchCards, MatchCardView } from "./match-card";

// Matches, like Hinge: the match waiting for your answer on top with Pass /
// Yes, then every other match as a card. Tap a card for the twins' full report.
export default function MatchesPage() {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Matches</h1>
          <FindMatchButton />
        </div>
        <Suspense fallback={<div className={`${CARD} mt-6 h-96`} />}>
          <MatchesFeed />
        </Suspense>
      </div>
    </main>
  );
}

type Row = {
  id: string;
  user_a: string;
  user_b: string;
  end_reason: string | null;
  turn_count: number;
  reports: { score: number } | { score: number }[] | null;
};

// Still waiting on this user's answer: nothing decided yet, or they sent a
// request this user hasn't accepted.
const needsAnswer = (s: DecisionState) =>
  !s.connected && !wantsToMeet(s.mine) && (s.mine === null || s.theyRequested);

function statusLine(state: DecisionState) {
  if (state.connected) return { text: "You both said yes", like: true };
  if (state.mine === "yes") return { text: "You said yes · waiting for them", like: false };
  if (state.mine === "request") return { text: "Connection request sent", like: false };
  return { text: "You passed", like: false };
}

async function MatchesFeed() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, end_reason, turn_count, reports(score)")
      .order("created_at", { ascending: false }),
    loadDecisionStates(supabase),
  ]);
  if (error) return <p className="mt-6 text-red-600">{error.message}</p>;

  const rows = ((data ?? []) as Row[]).map((c) => ({
    ...c,
    score: single(c.reports)?.score ?? null,
    state: states.get(c.id) ?? NO_DECISION,
  }));
  const reported = rows.filter((r) => r.score !== null).sort((x, y) => y.score! - x.score!);
  const chatting = rows.filter((r) => r.score === null && r.end_reason !== "error");
  // Requests waiting for an answer first, then the best scores.
  const waiting = reported
    .filter((r) => needsAnswer(r.state))
    .sort((x, y) => Number(y.state.theyRequested) - Number(x.state.theyRequested));
  const top = waiting[0];
  const rest = reported.filter((r) => r !== top);
  const cards = await loadMatchCards(supabase, user.id, reported);

  if (reported.length === 0 && chatting.length === 0) {
    return (
      <div className={`${CARD} mt-6 px-6 py-10 text-center`}>
        <p className="font-semibold text-black dark:text-zinc-50">Your twin hasn&apos;t had a first chat yet</p>
        <p className="mt-1 text-sm text-zinc-500">Find a match and your twin will go on the first chat for you.</p>
      </div>
    );
  }

  let yes: Decision = "yes";
  let yesLabel = "Yes";
  let note: string | null = null;
  if (top?.state.theyRequested) {
    yesLabel = "Accept";
    note = "They read your twins' chat and sent you a connection request.";
  } else if (top?.end_reason === "red_flag") {
    yes = "request";
    yesLabel = "Connect";
    note = "This chat ended on a dealbreaker. You can still ask to connect.";
  }
  const topCard = top ? cards.get(top.id) : undefined;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {chatting.map((c) => (
        <Link
          key={c.id}
          href={`/matches/${c.id}`}
          className={`${CARD} flex items-center gap-3 px-5 py-4 hover:border-zinc-400 dark:hover:border-zinc-600`}
        >
          <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" aria-hidden />
          <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
            Your twin is on a first chat now · {c.turn_count} turns so far
          </p>
          <span className="text-sm font-semibold text-black dark:text-zinc-50">Watch →</span>
        </Link>
      ))}

      {top && topCard && (
        <section>
          <p className={`${LABEL} mb-2`}>
            Waiting for you · {waiting.length === 1 ? "last one" : `1 of ${waiting.length}`}
          </p>
          <MatchCardView data={topCard}>
            {note && <p className={`${TWIN_NOTE} mx-5`}>{note}</p>}
            <DeckActions
              conversationId={top.id}
              yes={yes}
              yesLabel={yesLabel}
              canPass={top.state.mine !== "pass"}
            />
          </MatchCardView>
        </section>
      )}

      {rest.length > 0 && (
        <section className="flex flex-col gap-4">
          <p className={`${LABEL} mt-2`}>{top ? "Your other matches" : "Your matches"}</p>
          {rest.map((r) => {
            const card = cards.get(r.id);
            if (!card) return null;
            const status = needsAnswer(r.state) ? { text: "Waiting for your answer", like: false } : statusLine(r.state);
            return (
              <Link key={r.id} href={`/matches/${r.id}`} className="block rounded-2xl hover:opacity-90">
                <MatchCardView data={card}>
                  <div className="flex items-center justify-between border-t border-zinc-200 px-5 py-3 text-sm dark:border-zinc-800">
                    <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                      {status.like && (
                        <span aria-hidden className="text-brand">
                          ♥
                        </span>
                      )}
                      {needsAnswer(r.state) && <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />}
                      {status.text}
                    </span>
                    <span className="font-semibold text-black dark:text-zinc-50">Read report →</span>
                  </div>
                </MatchCardView>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
