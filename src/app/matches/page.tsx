import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ScoreRing } from "@/components/score-ring";
import { requireUser } from "@/lib/auth";
import {
  loadDecisionStates,
  loadRevealedProfiles,
  NO_DECISION,
  wantsToMeet,
  type DecisionState,
} from "@/lib/decisions";
import { END_REASON_LABELS, single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";
import { CARD, COLUMN, DOT_ALERT, PAGE } from "@/lib/ui";
import { FindMatchButton } from "./find-button";
import { HideButton } from "./hide-button";
import { loadMatchCards, TagChip, type CardData } from "./match-card";

// Matches, like Hinge's "Likes you": tiles for the matches waiting on your
// answer, then the people you matched with, then quieter groups you can open.
// You decide on the report page (tap a tile), never here.

// A yes that hasn't turned into a match stops waiting after this long, so
// nobody's card waits forever. It doesn't say whether the other side passed or
// never answered.
const EXPIRES_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export default function MatchesPage() {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Matches</h1>
          <FindMatchButton />
        </div>
        <Suspense fallback={<div className={`${CARD} mt-6 h-96`} />}>
          <MatchesGrid />
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
  ended_at: string | null;
  reports: { score: number } | { score: number }[] | null;
};

// Pages here render per request (they read the session), so "now" is the request time.
function isExpired(endedAt: string | null) {
  return Boolean(endedAt) && Date.now() - new Date(endedAt!).getTime() > EXPIRES_AFTER_MS;
}

const needsAnswer = (s: DecisionState) =>
  !s.connected && !wantsToMeet(s.mine) && (s.mine === null || s.theyRequested);

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-sm font-semibold text-zinc-500">{children}</h2>;
}

async function MatchesGrid() {
  const { supabase, user } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const [{ data, error }, states, { data: hiddenRows }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user_a, user_b, end_reason, turn_count, ended_at, reports(score)")
      .order("created_at", { ascending: false }),
    loadDecisionStates(supabase),
    // Needs migration 0011; without it nothing is hidden.
    supabase.from("hidden_matches").select("conversation_id"),
  ]);
  const hidden = new Set((hiddenRows ?? []).map((h) => h.conversation_id as string));
  if (error) return <p className="mt-6 text-red-600">{error.message}</p>;

  const rows = ((data ?? []) as Row[]).map((c) => ({
    ...c,
    score: single(c.reports)?.score ?? null,
    state: states.get(c.id) ?? NO_DECISION,
    otherId: c.user_a === user.id ? c.user_b : c.user_a,
  }));
  const chatting = rows.filter((r) => r.score === null && r.end_reason !== "error");
  const reported = rows.filter((r) => r.score !== null).sort((x, y) => y.score! - x.score!);
  const expired = (r: (typeof rows)[number]) => isExpired(r.ended_at);

  const toReview = reported
    .filter((r) => needsAnswer(r.state))
    .sort((x, y) => Number(y.state.theyRequested) - Number(x.state.theyRequested));
  const matched = reported.filter((r) => r.state.connected);
  const waitingOnThem = reported.filter((r) => !r.state.connected && wantsToMeet(r.state.mine));
  const pending = waitingOnThem.filter((r) => !expired(r));
  const lapsed = waitingOnThem.filter(expired);
  const passed = reported.filter((r) => r.state.mine === "pass" && !needsAnswer(r.state) && !hidden.has(r.id));

  const [cards, people] = await Promise.all([
    loadMatchCards(supabase, user.id, [...toReview, ...pending, ...lapsed, ...passed]),
    matched.length > 0 ? loadRevealedProfiles(createAdminClient(), matched.map((m) => m.otherId)) : new Map(),
  ]);

  if (reported.length === 0 && chatting.length === 0) {
    return (
      <div className={`${CARD} mt-6 px-6 py-10 text-center`}>
        <p className="font-semibold text-black dark:text-zinc-50">Your twin hasn&apos;t had a first chat yet</p>
        <p className="mt-1 text-sm text-zinc-500">Find a match and your twin will go on the first chat for you.</p>
      </div>
    );
  }

  return (
    <div>
      {chatting.map((c) => (
        <Link
          key={c.id}
          href={`/matches/${c.id}`}
          className={`${CARD} mt-6 flex items-center gap-3 px-4 py-3 hover:border-zinc-400 dark:hover:border-zinc-600`}
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-500" aria-hidden />
          <p className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">
            Your twin is on a first chat · {c.turn_count} turns so far
          </p>
          <span className="text-sm font-semibold text-black dark:text-zinc-50">Watch →</span>
        </Link>
      ))}

      {toReview.length > 0 && (
        <section>
          <SectionLabel>To review · {toReview.length}</SectionLabel>
          <ul className="grid grid-cols-2 gap-3">
            {toReview.map((r) => {
              const card = cards.get(r.id);
              return card ? (
                <li key={r.id}>
                  <ReviewTile id={r.id} card={card} request={r.state.theyRequested} />
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}

      {matched.length > 0 && (
        <section>
          <SectionLabel>Matched · {matched.length}</SectionLabel>
          <ul className="grid grid-cols-3 gap-3">
            {matched.map((m) => {
              const p = people.get(m.otherId);
              return (
                <li key={m.id}>
                  <Link
                    href={`/chat/${m.id}`}
                    className={`${CARD} flex h-full flex-col items-center px-2 py-4 text-center hover:border-zinc-400 dark:hover:border-zinc-600`}
                  >
                    <Avatar name={p?.name ?? "?"} url={p?.photoUrls[0]} className="h-16 w-16 text-xl" />
                    <p className="mt-2 w-full truncate font-semibold text-black dark:text-zinc-50">{p?.name ?? "Match"}</p>
                    <p className="text-sm text-zinc-500">
                      <span className="text-brand" aria-hidden>
                        ♥
                      </span>{" "}
                      {m.score}%
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <Group title={`Waiting for them · ${pending.length}`} hint="You said yes. They haven't answered yet.">
          {pending.map((r) => (
            <QuietRow key={r.id} id={r.id} card={cards.get(r.id)} note={r.state.mine === "request" ? "Request sent" : "You said yes"} />
          ))}
        </Group>
      )}

      {passed.length > 0 && (
        <Group title={`Passed · ${passed.length}`} hint="Only you can see these. Changed your mind? Open one to send a request.">
          {passed.map((r) => (
            <QuietRow
              key={r.id}
              id={r.id}
              card={cards.get(r.id)}
              note={r.end_reason === "red_flag" ? END_REASON_LABELS.red_flag : "You passed"}
              action="Send request"
              hideable
            />
          ))}
        </Group>
      )}

      {lapsed.length > 0 && (
        <Group title={`Expired · ${lapsed.length}`} hint="These didn't turn into a match within a week.">
          {lapsed.map((r) => (
            <QuietRow key={r.id} id={r.id} card={cards.get(r.id)} note="This one didn't turn into a match" />
          ))}
        </Group>
      )}
    </div>
  );
}

// A match waiting on your answer: score, who, one line and a tag or two.
function ReviewTile({ id, card, request }: { id: string; card: CardData; request: boolean }) {
  return (
    <Link
      href={`/matches/${id}`}
      className={`${CARD} relative flex h-full flex-col p-4 hover:border-zinc-400 dark:hover:border-zinc-600`}
    >
      <span className={`${DOT_ALERT} absolute right-4 top-4`} aria-label="Waiting for your answer" />
      <ScoreRing score={card.score} size={52} />
      <p className="mt-3 font-semibold text-black dark:text-zinc-50">
        {card.alias}
        {card.age !== null && `, ${card.age}`}
      </p>
      {card.place && <p className="truncate text-sm text-zinc-500">{card.place}</p>}
      {request && <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">Sent you a request</p>}
      <p className="mt-2 line-clamp-3 text-sm text-zinc-800 dark:text-zinc-200">{card.headline}</p>
      {card.tags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {card.tags.slice(0, 2).map((t) => (
            <TagChip key={t.label} tag={t} />
          ))}
        </div>
      )}
    </Link>
  );
}

// A closed-by-default group for the matches that don't need you right now.
function Group({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <details className={`${CARD} group mt-6 overflow-hidden`}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-600 dark:text-zinc-400 [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden className="text-lg leading-none transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <p className="border-t border-zinc-200 px-4 pt-3 text-xs text-zinc-500 dark:border-zinc-800">{hint}</p>
      <ul className="pb-1">{children}</ul>
    </details>
  );
}

function QuietRow({
  id,
  card,
  note,
  action,
  hideable = false,
}: {
  id: string;
  card?: CardData;
  note: string;
  action?: string;
  hideable?: boolean;
}) {
  if (!card) return null;
  return (
    <li className="flex items-center pr-3 hover:bg-zinc-50 dark:hover:bg-zinc-900">
      <Link href={`/matches/${id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
        <ScoreRing score={card.score} size={40} className="text-zinc-500 dark:text-zinc-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-black dark:text-zinc-50">
            {card.alias}
            {card.age !== null && `, ${card.age}`}
          </p>
          <p className="truncate text-sm text-zinc-500">{note}</p>
        </div>
        {action && <span className="shrink-0 text-sm font-semibold text-black dark:text-zinc-50">{action}</span>}
      </Link>
      {hideable && <HideButton conversationId={id} />}
    </li>
  );
}
