import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { KnownFor, ShortTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadChatSummaries } from "@/lib/chat";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet } from "@/lib/decisions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_PRIMARY, CARD, COLUMN, DOT_UNREAD, LABEL, PAGE, STORY_RING, TITLE } from "@/lib/ui";

// The inbox, like Instagram DMs: a row of new matches you haven't messaged yet
// and requests waiting for an answer, then your chats, most recent first.
export default function ConnectionsPage() {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <Suspense fallback={<div className={`${CARD} h-64`} />}>
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
  if (error) return <p className="text-red-600">{error.message}</p>;

  const connected: { id: string; otherId: string }[] = [];
  const requests: string[] = [];
  for (const c of (data ?? []) as Row[]) {
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) connected.push({ id: c.id, otherId: c.user_a === user.id ? c.user_b : c.user_a });
    else if (state.theyRequested && !wantsToMeet(state.mine)) requests.push(c.id);
  }
  const admin = createAdminClient();
  const [profiles, { data: decided }] =
    connected.length > 0
      ? await Promise.all([
          loadRevealedProfiles(admin, connected.map((c) => c.otherId)),
          // When the second yes came in, for "Known 3 days". Row-level security
          // hides the other side's decision, so read it with the admin client;
          // only the time is used.
          admin
            .from("decisions")
            .select("conversation_id, created_at")
            .in("conversation_id", connected.map((c) => c.id)),
        ])
      : [new Map(), { data: [] }];
  const connectedSince = new Map<string, string>();
  for (const d of (decided ?? []) as { conversation_id: string; created_at: string }[]) {
    const prev = connectedSince.get(d.conversation_id);
    if (!prev || d.created_at > prev) connectedSince.set(d.conversation_id, d.created_at);
  }

  // New matches: connected, but nobody has written yet. The rest are chats.
  const fresh = connected.filter((c) => !chats.has(c.id));
  const threads = connected
    .filter((c) => chats.has(c.id))
    .sort((x, y) => chats.get(y.id)!.lastAt.localeCompare(chats.get(x.id)!.lastAt));

  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="px-5 pb-2 pt-5">
        <h1 className={TITLE}>Connections</h1>
      </div>

      {connected.length === 0 && requests.length === 0 ? (
        <div className="px-5 pb-8 pt-4 text-center">
          <p className="font-semibold text-black dark:text-zinc-50">Your first connection is a yes away</p>
          <p className="mt-1 text-sm text-zinc-500">
            Say yes to a match you like. If they say yes too, you&apos;ll both show up here and can chat.
          </p>
          <Link href="/matches" className={`${BTN_PRIMARY} mt-5`}>
            See your matches
          </Link>
        </div>
      ) : (
        <>
          {(fresh.length > 0 || requests.length > 0) && (
            <div className="border-b border-zinc-200 pb-4 dark:border-zinc-800">
              <p className={`px-5 ${LABEL}`}>New matches</p>
              <ul className="mt-3 flex gap-4 overflow-x-auto px-5">
                {fresh.map((c) => {
                  const p = profiles.get(c.otherId);
                  return (
                    <li key={c.id} className="shrink-0">
                      <Link href={`/chat/${c.id}`} className="flex w-16 flex-col items-center gap-1 text-center">
                        <span className={STORY_RING}>
                          <span className="block rounded-full bg-white p-[2px] dark:bg-zinc-950">
                            <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-14 w-14 text-xl" />
                          </span>
                        </span>
                        <span className="w-full truncate text-sm text-zinc-600 dark:text-zinc-400">
                          {p?.name ?? "New match"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {requests.map((id) => (
                  <li key={id} className="shrink-0">
                    <Link href={`/matches/${id}`} className="flex w-16 flex-col items-center gap-1 text-center">
                      <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-lg text-zinc-400 dark:border-zinc-700">
                        ?
                      </span>
                      <span className="w-full truncate text-sm text-zinc-600 dark:text-zinc-400">Request</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {threads.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-zinc-500">
              Tap a new match to say hi. Your twins already did the small talk.
            </p>
          ) : (
            <ul className="py-1">
              {threads.map((c) => {
                const p = profiles.get(c.otherId);
                const chat = chats.get(c.id)!;
                const unread = chat.unread > 0;
                return (
                  <li key={c.id}>
                    <Link
                      href={`/chat/${c.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-14 w-14 text-lg" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-base font-medium text-black dark:text-zinc-50">
                            {p?.name ?? "Your match"}
                            {p?.isSeed && <span className="ml-2 text-xs font-normal text-zinc-500">Demo</span>}
                          </p>
                          <ShortTime iso={chat.lastAt} className="shrink-0 text-sm text-zinc-500" />
                        </div>
                        <div className="flex items-center gap-3">
                          <p
                            className={`min-w-0 flex-1 truncate text-sm ${
                              unread ? "font-semibold text-black dark:text-zinc-50" : "text-zinc-500"
                            }`}
                          >
                            {chat.lastFromMe ? "You: " : ""}
                            {chat.lastContent}
                          </p>
                          {unread && (
                            <span className={DOT_UNREAD}>
                              <span className="sr-only">{chat.unread} unread</span>
                            </span>
                          )}
                        </div>
                        {connectedSince.has(c.id) && (
                          <p className="mt-0.5 text-xs text-zinc-400">
                            <KnownFor since={connectedSince.get(c.id)!} />
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
