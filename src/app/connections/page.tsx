import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { decisionState, loadRevealedProfiles, wantsToMeet, type DecisionRow } from "@/lib/decisions";
import { scoreColor, single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";

// People the user is connected with (both said yes), and connection requests
// waiting for their answer.
export default function ConnectionsPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <Link href="/matches" className="text-sm text-zinc-500 hover:underline">
          ← Your matches
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Connections
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          People you both said yes to, and requests waiting for your answer.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <ConnectionsLoader />
        </Suspense>
      </div>
    </main>
  );
}

type Row = {
  id: string;
  user_a: string;
  user_b: string;
  reports: { score: number } | { score: number }[] | null;
  decisions: DecisionRow[] | null;
};

async function ConnectionsLoader() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const { data, error } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, reports(score), decisions(user_id, decision)")
    .eq("status", "ended")
    .order("created_at", { ascending: false });
  if (error) return <p className="mt-8 text-red-600">{error.message}</p>;

  const connected: { id: string; otherId: string }[] = [];
  const requests: { id: string; score: number | null }[] = [];
  for (const c of (data ?? []) as Row[]) {
    const state = decisionState(c.decisions ?? [], user.id);
    if (state.connected) {
      connected.push({ id: c.id, otherId: c.user_a === user.id ? c.user_b : c.user_a });
    } else if (state.theyRequested && !wantsToMeet(state.mine)) {
      requests.push({ id: c.id, score: single(c.reports)?.score ?? null });
    }
  }
  const profiles =
    connected.length > 0
      ? await loadRevealedProfiles(createAdminClient(), connected.map((c) => c.otherId))
      : new Map();

  const item =
    "flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600";

  return (
    <div className="mt-8 flex flex-col gap-8">
      {requests.length > 0 && (
        <section>
          <h2 className="font-semibold text-black dark:text-zinc-50">Waiting for your answer</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/matches/${r.id}`} className={item}>
                  {r.score !== null && (
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${scoreColor(r.score)}`}>
                      {r.score}
                    </span>
                  )}
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    Someone sent you a connection request. Open the report to accept or pass.
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-semibold text-black dark:text-zinc-50">Connected</h2>
        {connected.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No connections yet. Say yes on a match report you like; if they say yes too, they show up here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {connected.map((c) => {
              const p = profiles.get(c.otherId);
              return (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className={item}>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg font-semibold text-green-800 dark:bg-green-950 dark:text-green-300">
                      {(p?.name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-medium text-black dark:text-zinc-50">
                        {p?.name ?? "Your match"}
                        {p?.age != null && `, ${p.age}`}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {[p?.city, p?.isSeed ? "Demo profile" : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
