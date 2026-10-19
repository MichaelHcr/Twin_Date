import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, NO_DECISION, wantsToMeet, type DecisionState } from "@/lib/decisions";
import { END_REASON_LABELS, single } from "@/lib/matches";
import { CARD, CHIP_NEUTRAL, CHIP_YOU, COLUMN, PAGE, TITLE } from "@/lib/ui";
import { FindMatchButton } from "./find-button";
import { MatchDeck, needsAnswer } from "./match-deck";

// Matches: the deck of reports waiting for a yes or pass, then every first chat
// the twin has had, best score first.
export default function MatchesPage() {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <Suspense fallback={<div className={`${CARD} h-96`} />}>
          <MatchesLoader />
        </Suspense>
      </div>
    </main>
  );
}

type Row = {
  id: string;
  user_a: string;
  user_b: string;
  status: string;
  end_reason: string | null;
  turn_count: number;
  created_at: string;
  reports: { score: number; summary: string } | { score: number; summary: string }[] | null;
};

// Where the Yes / Pass choice stands for one match, as a small tag.
function decisionTag(state: DecisionState, hasReport: boolean) {
  if (!hasReport) return null;
  if (state.connected) return { label: "Matched", tone: CHIP_YOU };
  if (state.theyRequested && !wantsToMeet(state.mine)) return { label: "Wants to connect", tone: CHIP_YOU };
  if (state.mine === null) return { label: "Your call", tone: CHIP_YOU };
  if (state.mine === "yes") return { label: "You said yes", tone: CHIP_NEUTRAL };
  if (state.mine === "request") return { label: "Request sent", tone: CHIP_NEUTRAL };
  return { label: "Passed", tone: CHIP_NEUTRAL };
}

async function MatchesLoader() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, status, end_reason, turn_count, created_at, reports(score, summary)")
      .order("created_at", { ascending: false }),
    loadDecisionStates(supabase),
  ]);
  if (error) return <p className="text-red-600">{error.message}</p>;

  const rows = ((data ?? []) as Row[])
    .map((c) => {
      const report = single(c.reports);
      const state = states.get(c.id) ?? NO_DECISION;
      return { ...c, report, state, tag: decisionTag(state, Boolean(report)) };
    })
    .sort((x, y) => (y.report?.score ?? -1) - (x.report?.score ?? -1));

  // The deck: requests waiting for an answer first, then the best scores.
  const waiting = rows
    .filter((c) => c.report && needsAnswer(c.state))
    .sort((x, y) => Number(y.state.theyRequested) - Number(x.state.theyRequested));

  return (
    <div className="flex flex-col gap-6">
      <MatchDeck supabase={supabase} userId={user.id} waiting={waiting} />

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
          <h2 className={TITLE}>All matches</h2>
          {waiting.length > 0 && <FindMatchButton />}
        </div>
        {rows.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-zinc-500">
            No first chats yet. Find a match to send your twin on one.
          </p>
        ) : (
          <ul className="pb-2">
            {rows.map((c, i) => (
              <li key={c.id}>
                <Link
                  href={`/matches/${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-brand text-base font-medium text-brand-ink dark:text-pink-300">
                    {c.report?.score ?? "…"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-black dark:text-zinc-50">Match #{i + 1}</p>
                      {c.tag && <span className={c.tag.tone}>{c.tag.label}</span>}
                    </div>
                    <p className="truncate text-sm text-zinc-500">
                      {c.report?.summary ??
                        (c.status === "ended" ? "Open to see the report." : "Your twin is chatting now.")}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {c.end_reason ? END_REASON_LABELS[c.end_reason] : "In progress"} · {c.turn_count} turns
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
