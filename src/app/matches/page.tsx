import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, NO_DECISION, wantsToMeet, type DecisionState } from "@/lib/decisions";
import type { View } from "@/lib/agents/judge";
import { END_REASON_LABELS, fillMatch, scoreColor, single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { FindMatchButton } from "./find-button";
import { BackLink } from "@/components/back-link";

// The shortlist: every twin conversation the user is part of, best score first.
export default function MatchesPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <BackLink href="/">Home</BackLink>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your matches
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          First chats your twin had, ranked by how promising they look.
        </p>
        <div className="mt-6 flex flex-wrap items-start gap-3">
          <FindMatchButton />
          <Link
            href="/connections"
            className="rounded-full border-2 border-black px-6 py-2.5 text-base font-semibold text-black hover:bg-zinc-100 dark:border-white dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Your connections →
          </Link>
        </div>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <MatchesLoader />
        </Suspense>
      </div>
    </main>
  );
}

type ReportRow = { score: number; summary: string; views: Record<"a" | "b", View> | null };

type Row = {
  id: string;
  status: string;
  end_reason: string | null;
  turn_count: number;
  created_at: string;
  user_a: string;
  user_b: string;
  reports: ReportRow | ReportRow[] | null;
};

// Where the Yes / Pass choice stands for one match, as a small label.
function decisionBadge(state: DecisionState, hasReport: boolean) {
  if (!hasReport) return null;
  if (state.connected) return { label: "Matched", tone: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", todo: false };
  if (state.theyRequested && !wantsToMeet(state.mine)) {
    return { label: "Wants to connect", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", todo: true };
  }
  if (state.mine === null) return { label: "Your call: yes or pass?", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", todo: true };
  const done = "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
  if (state.mine === "yes") return { label: "You said yes", tone: done, todo: false };
  if (state.mine === "request") return { label: "Request sent", tone: done, todo: false };
  return { label: "Passed", tone: done, todo: false };
}

async function MatchesLoader() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, status, end_reason, turn_count, created_at, reports(score, summary, views)")
      .order("created_at", { ascending: false }),
    loadDecisionStates(supabase),
  ]);
  if (error) return <p className="mt-8 text-red-600">{error.message}</p>;

  const rows = ((data ?? []) as Row[])
    .map((c) => {
      const report = single(c.reports);
      return { ...c, report, badge: decisionBadge(states.get(c.id) ?? NO_DECISION, Boolean(report)) };
    })
    .sort((x, y) => (y.report?.score ?? -1) - (x.report?.score ?? -1));

  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        No chats yet. Press “Find my next match” to send your twin on a first chat.
      </div>
    );
  }

  const waiting = rows.filter((c) => c.badge?.todo).length;

  // Each report's headline is written to this user; after a mutual yes it uses
  // the other person's first name (row-level security hides it, so the admin
  // client reads it, only for connected matches).
  const otherOf = (c: Row) => (c.user_a === user.id ? c.user_b : c.user_a);
  const connectedIds = rows.filter((c) => states.get(c.id)?.connected).map(otherOf);
  const names = new Map<string, string>();
  if (connectedIds.length > 0) {
    const { data: profiles } = await createAdminClient()
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", connectedIds);
    for (const p of profiles ?? []) if (p.display_name) names.set(p.user_id, p.display_name.split(" ")[0]);
  }
  const blurb = (c: (typeof rows)[number]) => {
    if (!c.report) return null;
    const view = c.report.views?.[c.user_a === user.id ? "a" : "b"];
    if (!view) return c.report.summary;
    const name = states.get(c.id)?.connected ? names.get(otherOf(c)) : null;
    return fillMatch(view.headline, name);
  };

  return (
    <>
      {waiting > 0 && (
        <p className="mt-8 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          {waiting === 1 ? "1 match is" : `${waiting} matches are`} waiting for your yes or pass. Open the ones marked below.
        </p>
      )}
      <ul className={`${waiting > 0 ? "mt-4" : "mt-8"} flex flex-col gap-3`}>
        {rows.map((c, i) => (
          <li key={c.id}>
            <Link
              href={`/matches/${c.id}`}
              className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              {c.report ? (
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${scoreColor(c.report.score)}`}
                >
                  {c.report.score}
                </span>
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-900">
                  …
                </span>
              )}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-black dark:text-zinc-50">
                  Match #{i + 1}
                  {c.badge && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.badge.tone}`}>{c.badge.label}</span>
                  )}
                </p>
                <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {blurb(c) ??
                    (c.status === "ended" ? "Open to see the report." : "Open to watch your twin chat.")}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {c.end_reason ? END_REASON_LABELS[c.end_reason] : "In progress"} · {c.turn_count} turns
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
