import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ShortTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadChatSummaries } from "@/lib/chat";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet } from "@/lib/decisions";
import { scoreColor, single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { BackLink } from "@/components/back-link";

// People the user is connected with (both said yes), and connection requests
// waiting for their answer.
export default function ConnectionsPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <BackLink href="/matches">Your matches</BackLink>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
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
};

async function ConnectionsLoader() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, reports(score)")
      .eq("status", "ended")
      .order("created_at", { ascending: false }),
    loadDecisionStates(supabase),
  ]);
  if (error) return <p className="mt-8 text-red-600">{error.message}</p>;

  const connected: { id: string; otherId: string }[] = [];
  const requests: { id: string; score: number | null }[] = [];
  for (const c of (data ?? []) as Row[]) {
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) {
      connected.push({ id: c.id, otherId: c.user_a === user.id ? c.user_b : c.user_a });
    } else if (state.theyRequested && !wantsToMeet(state.mine)) {
      requests.push({ id: c.id, score: single(c.reports)?.score ?? null });
    }
  }
  const [profiles, chats] = await Promise.all([
    connected.length > 0
      ? loadRevealedProfiles(createAdminClient(), connected.map((c) => c.otherId))
      : new Map(),
    loadChatSummaries(supabase),
  ]);
  // Most recent conversation first; chats nobody has written in yet go last.
  connected.sort((x, y) => (chats.get(y.id)?.lastAt ?? "").localeCompare(chats.get(x.id)?.lastAt ?? ""));

  const item = "flex items-center gap-4 rounded-2xl border p-4";
  const plain = `${item} border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600`;
  const urgent = `${item} border-amber-300 bg-amber-50 hover:border-amber-500 dark:border-amber-900 dark:bg-amber-950`;

  return (
    <div className="mt-8 flex flex-col gap-8">
      {requests.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-black dark:text-zinc-50">
            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Waiting for your answer
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/matches/${r.id}`} className={urgent}>
                  {r.score !== null && (
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${scoreColor(r.score)}`}>
                      {r.score}
                    </span>
                  )}
                  <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
                    Someone sent you a connection request after reading your twins&apos; chat.
                  </p>
                  <span className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">
                    Answer
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Connected{connected.length > 0 && <span className="ml-2 text-zinc-500">{connected.length}</span>}
        </h2>
        {connected.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            No connections yet. Say yes on a match report you like; if they say yes too, they show up here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {connected.map((c) => {
              const p = profiles.get(c.otherId);
              const chat = chats.get(c.id);
              const unread = chat?.unread ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`/chat/${c.id}`} className={unread > 0 ? urgent : plain}>
                    <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-16 w-16 text-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-lg font-semibold text-black dark:text-zinc-50">
                          {p?.name ?? "Your match"}
                          {p?.age != null && `, ${p.age}`}
                        </p>
                        {chat && <ShortTime iso={chat.lastAt} className="shrink-0 text-xs text-zinc-500" />}
                      </div>
                      <p className="text-sm text-zinc-500">
                        {[p?.city, p?.isSeed ? "Demo profile" : null].filter(Boolean).join(" · ")}
                      </p>
                      <p
                        className={`mt-1 truncate text-sm ${
                          unread > 0 ? "font-semibold text-black dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {chat ? `${chat.lastFromMe ? "You: " : ""}${chat.lastContent}` : "No messages yet. Say hi!"}
                      </p>
                    </div>
                    {unread > 0 ? (
                      <span className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white">
                        {unread} new
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">
                        Chat
                      </span>
                    )}
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
