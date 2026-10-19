import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureMatchCard, type MatchCard } from "@/lib/agents/match-card";
import { ageOf } from "@/lib/decisions";
import { TOPICS } from "@/lib/profile-topics";
import { createAdminClient } from "@/lib/supabase/admin";
import { CARD, CHIP_FLAG, CHIP_NEUTRAL } from "@/lib/ui";

// A match as a Hinge-style card: who (still anonymous), one big line from the
// twins' report, their shortest quote as a prompt, and a few tags. Tapping it
// opens the full report.

export type CardItem = { id: string; user_a: string; user_b: string };

type Tag = { label: string; kind: "aligned" | "ask" | "flag" };

export type CardData = {
  alias: string;
  age: number | null;
  place: string;
  score: number;
  headline: string;
  quote: string | null;
  tags: Tag[];
};

type Evidence = { speaker: "a" | "b"; quote: string };
type ReportRow = {
  conversation_id: string;
  score: number;
  summary: string;
  evidence_json: Evidence[] | null;
  red_flags: string[] | null;
  questions_to_ask: string[] | null;
};

// Topics with set answers, where the same answer on both sides is worth a tag
// when the card agent hasn't written tags yet.
const ALIGNABLE = ["kids", "smoking", "relocation"];
const SHORT_GOALS: Record<string, string> = { long_term: "long-term", short_term: "short-term", open: "open to either" };

// Everything the cards need, keyed by conversation id. Only conversations with
// a report get a card. Names and photos are never read here: they stay hidden
// until both say yes.
export async function loadMatchCards(supabase: SupabaseClient, userId: string, items: CardItem[]) {
  const result = new Map<string, CardData>();
  if (items.length === 0) return result;
  const admin = createAdminClient();
  const otherOf = (c: CardItem) => (c.user_a === userId ? c.user_b : c.user_a);
  const otherIds = [...new Set(items.map(otherOf))];

  const [{ data: reports }, { data: profiles }, { data: answers }, cards] = await Promise.all([
    // Row-level security returns only reports of this user's conversations.
    supabase
      .from("reports")
      .select("conversation_id, score, summary, evidence_json, red_flags, questions_to_ask")
      .in("conversation_id", items.map((c) => c.id)),
    // Age, city and goal only.
    admin.from("profiles").select("user_id, birthdate, city, goal").in("user_id", otherIds),
    // Only compared to say "aligned"; the answers themselves aren't shown.
    admin.from("profile_answers").select("user_id, topic, answer").in("user_id", [userId, ...otherIds]).in("topic", ALIGNABLE),
    Promise.all(items.map((c) => ensureMatchCard(admin, c.id).catch((): MatchCard | null => null))),
  ]);

  const answerOf = (uid: string, topic: string) =>
    (answers ?? []).find((a) => a.user_id === uid && a.topic === topic)?.answer?.trim().toLowerCase();

  items.forEach((c, i) => {
    const report = (reports ?? []).find((r) => r.conversation_id === c.id) as ReportRow | undefined;
    if (!report) return;
    const mySide = c.user_a === userId ? "a" : "b";
    const otherId = otherOf(c);
    const profile = (profiles ?? []).find((p) => p.user_id === otherId);
    const card = cards[i];

    const quote =
      (report.evidence_json ?? [])
        .filter((e) => e.speaker !== mySide)
        .sort((x, y) => x.quote.length - y.quote.length)[0]?.quote ?? null;
    const firstSentence = report.summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? report.summary;
    const tags: Tag[] = card
      ? card.tags
      : [
          ...ALIGNABLE.filter((t) => {
            const mine = answerOf(userId, t);
            return mine && mine !== "not sure yet" && mine === answerOf(otherId, t);
          }).map((t) => ({ label: `${TOPICS.find((x) => x.key === t)?.label ?? t}: aligned`, kind: "aligned" as const })),
          ...(report.red_flags ?? []).map((label) => ({ label, kind: "flag" as const })),
        ];

    result.set(c.id, {
      alias: `Member ${mySide === "a" ? "B" : "A"}`,
      age: ageOf(profile?.birthdate ?? null),
      place: [profile?.city, profile?.goal ? SHORT_GOALS[profile.goal] : null].filter(Boolean).join(" · "),
      score: report.score,
      headline: card?.headline ?? firstSentence,
      quote,
      tags,
    });
  });
  return result;
}

function TagChip({ tag }: { tag: Tag }) {
  const icon = tag.kind === "aligned" ? "✓" : tag.kind === "ask" ? "?" : "!";
  return (
    <span className={`${tag.kind === "flag" ? CHIP_FLAG : CHIP_NEUTRAL} max-w-full`}>
      <span aria-hidden className="text-xs font-semibold text-zinc-400">
        {icon}
      </span>
      <span className="truncate">{tag.kind === "ask" ? tag.label.replace(/^Ask:\s*/i, "Ask: ") : tag.label}</span>
    </span>
  );
}

export function MatchCardView({ data, children }: { data: CardData; children?: React.ReactNode }) {
  return (
    <article className={`${CARD} overflow-hidden`}>
      <header className="flex items-center justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-black dark:text-zinc-50">
            {data.alias}
            {data.age !== null && `, ${data.age}`}
          </p>
          {data.place && <p className="truncate text-sm text-zinc-500">{data.place}</p>}
        </div>
        <span className="flex shrink-0 flex-col items-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-black text-base font-semibold text-black dark:border-white dark:text-zinc-50">
            {data.score}
          </span>
          <span className="mt-0.5 text-[11px] text-zinc-500">match</span>
        </span>
      </header>

      <div className="px-5 pb-1 pt-4">
        <p className="text-xs font-medium text-violet-700 dark:text-violet-300">Your twins found</p>
        <p className="mt-1 font-serif text-2xl leading-snug text-black dark:text-zinc-50">{data.headline}</p>
      </div>

      {data.quote && (
        <div className="mx-5 mt-4 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-500">They said</p>
          <p className="mt-1 font-serif text-lg leading-snug text-zinc-800 dark:text-zinc-200">“{data.quote}”</p>
        </div>
      )}

      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5 pt-4">
          {data.tags.map((t) => (
            <TagChip key={t.label} tag={t} />
          ))}
        </div>
      )}

      <div className="pt-4">{children}</div>
    </article>
  );
}
