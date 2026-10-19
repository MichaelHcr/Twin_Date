import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Avatar } from "@/components/avatar";
import { FindMatchButton } from "@/app/matches/find-button";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet } from "@/lib/decisions";
import { scoreColor, single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";

type Row = {
  id: string;
  user_a: string;
  user_b: string;
  reports: { score: number } | { score: number }[] | null;
};

const CARD =
  "flex flex-col rounded-3xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

// The home page once onboarding is done: the two places people come back for.
export async function HomeDashboard({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  // Row-level security only returns conversations this user is part of.
  const [{ data }, states] = await Promise.all([
    supabase.from("conversations").select("id, user_a, user_b, reports(score)"),
    loadDecisionStates(supabase),
  ]);

  let chats = 0;
  let yourCall = 0;
  let requests = 0;
  let topScore: number | null = null;
  const connectedIds: string[] = [];
  for (const c of (data ?? []) as Row[]) {
    chats++;
    const report = single(c.reports);
    if (!report) continue;
    topScore = Math.max(topScore ?? 0, report.score);
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) connectedIds.push(c.user_a === userId ? c.user_b : c.user_a);
    else if (state.theyRequested && !wantsToMeet(state.mine)) requests++;
    else if (state.mine === null) yourCall++;
  }
  const faces =
    connectedIds.length > 0
      ? [...(await loadRevealedProfiles(createAdminClient(), connectedIds.slice(0, 4))).values()]
      : [];

  return (
    <div className="mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
      <section className={CARD}>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Matches</h2>
          {topScore !== null && (
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreColor(topScore)}`}>
              Top {topScore}
            </span>
          )}
        </div>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {chats === 0
            ? "Your twin hasn't had a first chat yet."
            : `${chats} first ${chats === 1 ? "chat" : "chats"} by your twin.`}
        </p>
        {yourCall > 0 && <Waiting>{yourCall} waiting for your yes or pass</Waiting>}
        <div className="mt-auto flex flex-col items-start gap-3 pt-6">
          <FindMatchButton />
          {chats > 0 && (
            <Link href="/matches" className="text-sm font-medium text-black underline dark:text-zinc-50">
              See all matches →
            </Link>
          )}
        </div>
      </section>

      <section className={CARD}>
        <h2 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Connections</h2>
        {faces.length > 0 ? (
          <div className="mt-3 flex items-center">
            {faces.map((p) => (
              <Avatar
                key={p.userId}
                name={p.name}
                url={p.photoUrls[0]}
                className="-mr-3 h-12 w-12 text-base ring-4 ring-white dark:ring-zinc-950"
              />
            ))}
          </div>
        ) : null}
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {connectedIds.length === 0
            ? "People you both said yes to show up here, with a chat."
            : `${connectedIds.length} connected.`}
        </p>
        {requests > 0 && (
          <Waiting>
            {requests} connection {requests === 1 ? "request" : "requests"} waiting
          </Waiting>
        )}
        <div className="mt-auto pt-6">
          <Link
            href="/connections"
            className="inline-block rounded-full border-2 border-black px-6 py-2.5 text-base font-semibold text-black hover:bg-zinc-100 dark:border-white dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            Open connections →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
      {children}
    </p>
  );
}
