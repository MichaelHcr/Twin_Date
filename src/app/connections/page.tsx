import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { KnownFor, ShortTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadChatSummaries } from "@/lib/chat";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet } from "@/lib/decisions";
import { single } from "@/lib/matches";
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

type Row = {
  id: string;
  user_a: string;
  user_b: string;
  reports: { score: number } | { score: number }[] | null;
};

const DAY_MS = 86_400_000;

// Pages here render per request (they read the session), so "now" is the request time.
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

// Days in a row, ending today or yesterday, on which both people sent at least
// one message (by UTC day). Like a Snapchat streak; shown from 2 days.
function streakDays(messages: { sender_id: string; created_at: string }[], userId: string) {
  const days = new Map<number, Set<"me" | "them">>();
  for (const m of messages) {
    const day = Math.floor(new Date(m.created_at).getTime() / DAY_MS);
    if (!days.has(day)) days.set(day, new Set());
    days.get(day)!.add(m.sender_id === userId ? "me" : "them");
  }
  const both = (d: number) => days.get(d)?.size === 2;
  let day = Math.floor(Date.now() / DAY_MS);
  if (!both(day)) day -= 1;
  let streak = 0;
  while (both(day)) {
    streak++;
    day -= 1;
  }
  return streak;
}

async function Inbox() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states, chats] = await Promise.all([
    supabase.from("conversations").select("id, user_a, user_b, reports(score)").eq("status", "ended"),
    loadDecisionStates(supabase),
    loadChatSummaries(supabase),
  ]);
  if (error) return <p className="text-red-600">{error.message}</p>;

  const connected: { id: string; otherId: string; score: number | null }[] = [];
  const requests: string[] = [];
  for (const c of (data ?? []) as Row[]) {
    const state = states.get(c.id) ?? NO_DECISION;
    if (state.connected) {
      connected.push({ id: c.id, otherId: c.user_a === user.id ? c.user_b : c.user_a, score: single(c.reports)?.score ?? null });
    }
    else if (state.theyRequested && !wantsToMeet(state.mine)) requests.push(c.id);
  }
  const ids = connected.map((c) => c.id);
  const admin = createAdminClient();
  const [profiles, { data: decided }, { data: recent }] =
    connected.length > 0
      ? await Promise.all([
          loadRevealedProfiles(admin, connected.map((c) => c.otherId)),
          // When the second yes came in. Row-level security hides the other side's
          // decision, so read it with the admin client; only the time is used.
          admin.from("decisions").select("conversation_id, created_at").in("conversation_id", ids),
          // The last month of messages, for streaks.
          supabase
            .from("chat_messages")
            .select("conversation_id, sender_id, created_at")
            .in("conversation_id", ids)
            .gte("created_at", daysAgoIso(31)),
        ])
      : [new Map(), { data: [] }, { data: [] }];
  const matchedAt = new Map<string, string>();
  for (const d of (decided ?? []) as { conversation_id: string; created_at: string }[]) {
    const prev = matchedAt.get(d.conversation_id);
    if (!prev || d.created_at > prev) matchedAt.set(d.conversation_id, d.created_at);
  }
  const streaks = new Map(
    ids.map((id) => [
      id,
      streakDays(
        ((recent ?? []) as { conversation_id: string; sender_id: string; created_at: string }[]).filter(
          (m) => m.conversation_id === id,
        ),
        user.id,
      ),
    ]),
  );

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
                const yourTurn = !chat.lastFromMe && !unread;
                const streak = streaks.get(c.id) ?? 0;
                const since = matchedAt.get(c.id);
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
                          {yourTurn && !p?.isSeed && (
                            <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              Your turn
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-400">
                          {since && <KnownFor since={since} />}
                          {c.score !== null && <span>· {c.score}% match</span>}
                          {streak >= 2 && (
                            <span className="font-medium text-orange-500" title={`You've both messaged ${streak} days in a row`}>
                              · 🔥 {streak}
                            </span>
                          )}
                        </p>
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
