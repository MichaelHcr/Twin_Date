import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ShortTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadChatSummaries } from "@/lib/chat";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet } from "@/lib/decisions";
import { createAdminClient } from "@/lib/supabase/admin";

// The inbox, like Instagram DMs: a row of new matches you haven't messaged yet
// and requests waiting for an answer, then your chats, most recent first.
export default function ConnectionsPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-10 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">Connections</h1>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <Inbox />
        </Suspense>
      </div>
    </main>
  );
}

type Row = { id: string; user_a: string; user_b: string };

async function Inbox() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states, chats] = await Promise.all([
    supabase.from("conversations").select("id, user_a, user_b").eq("status", "ended"),
    loadDecisionStates(supabase),
    loadChatSummaries(supabase),
  ]);
  if (error) return <p className="mt-8 text-red-600">{error.message}</p>;

  const connected: { id: string; otherId: string }[] = [];
  const requests: string[] = [];
  for (const c of (data ?? []) as Row[]) {
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) connected.push({ id: c.id, otherId: c.user_a === user.id ? c.user_b : c.user_a });
    else if (state.theyRequested && !wantsToMeet(state.mine)) requests.push(c.id);
  }
  const profiles =
    connected.length > 0
      ? await loadRevealedProfiles(createAdminClient(), connected.map((c) => c.otherId))
      : new Map();

  // New matches: connected, but nobody has written yet. The rest are chats.
  const fresh = connected.filter((c) => !chats.has(c.id));
  const threads = connected
    .filter((c) => chats.has(c.id))
    .sort((x, y) => chats.get(y.id)!.lastAt.localeCompare(chats.get(x.id)!.lastAt));

  if (connected.length === 0 && requests.length === 0) {
    return (
      <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-lg font-semibold text-black dark:text-zinc-50">Your first connection is a yes away</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Say yes to a match you like. If they say yes too, you&apos;ll see each other here and can chat.
        </p>
        <Link
          href="/matches"
          className="mt-5 inline-block rounded-full bg-black px-6 py-2.5 text-base font-semibold text-white dark:bg-white dark:text-black"
        >
          See your matches
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {(fresh.length > 0 || requests.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500">New matches</h2>
          <ul className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {requests.map((id) => (
              <li key={id} className="shrink-0">
                <Link href={`/matches/${id}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-amber-400 bg-amber-50 text-2xl font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    ?
                  </span>
                  <span className="w-full truncate text-xs font-medium text-amber-800 dark:text-amber-300">Request</span>
                </Link>
              </li>
            ))}
            {fresh.map((c) => {
              const p = profiles.get(c.otherId);
              return (
                <li key={c.id} className="shrink-0">
                  <Link href={`/chat/${c.id}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
                    <span className="rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 p-[3px]">
                      <span className="block rounded-full bg-zinc-50 p-[2px] dark:bg-black">
                        <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-14 w-14 text-lg" />
                      </span>
                    </span>
                    <span className="w-full truncate text-xs font-medium text-black dark:text-zinc-50">
                      {p?.name ?? "New match"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-zinc-500">Messages</h2>
        {threads.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            Tap a new match above to say hi. Your twins already did the small talk.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {threads.map((c) => {
              const p = profiles.get(c.otherId);
              const chat = chats.get(c.id)!;
              const unread = chat.unread > 0;
              return (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-14 w-14 text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-base text-black dark:text-zinc-50 ${unread ? "font-semibold" : "font-medium"}`}>
                          {p?.name ?? "Your match"}
                          {p?.isSeed && <span className="ml-2 text-xs font-normal text-zinc-500">Demo</span>}
                        </p>
                        <ShortTime
                          iso={chat.lastAt}
                          className={`shrink-0 text-xs ${unread ? "font-semibold text-rose-600" : "text-zinc-500"}`}
                        />
                      </div>
                      <p
                        className={`truncate text-sm ${
                          unread ? "font-semibold text-black dark:text-zinc-50" : "text-zinc-500"
                        }`}
                      >
                        {chat.lastFromMe ? "You: " : ""}
                        {chat.lastContent}
                      </p>
                    </div>
                    {unread && (
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">
                        {chat.unread}
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
