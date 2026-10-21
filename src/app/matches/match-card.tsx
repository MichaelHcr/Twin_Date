import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureMatchCard, type MatchCard } from "@/lib/agents/match-card";
import type { View } from "@/lib/agents/judge";
import { ageOf } from "@/lib/decisions";
import { fillMatch } from "@/lib/matches";
import { TOPICS } from "@/lib/profile-topics";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHIP_FLAG, CHIP_NEUTRAL } from "@/lib/ui";

// What a match card shows: who (still anonymous), one short line from the
// twins' report, and a few tags. Used by the Matches grid.

export type CardItem = { id: string; user_a: string; user_b: string };

type Tag = { label: string; kind: "aligned" | "ask" | "flag" };

export type CardData = {
  alias: string;
  age: number | null;
  place: string;
  score: number;
  headline: string;
  tags: Tag[];
};

type ReportRow = {
  conversation_id: string;
  score: number;
  summary: string;
  red_flags: string[] | null;
  questions_to_ask: string[] | null;
  // Per-reader versions of the report (main's migration 0010); older reports have none.
  views: Record<"a" | "b", View> | null;
};

// Topics with set answers, where the same answer on both sides is worth a tag
// when the card agent hasn't written tags yet.
const ALIGNABLE = ["kids", "smoking", "relocation"];
const SHORT_GOALS: Record<string, string> = { long_term: "long-term", short_term: "short-term", open: "open to either" };

// Without the card agent's headline: the report's first sentence, cut before a
// colon and to about 16 words, so the card still reads at a glance.
function shortLine(summary: string) {
  const sentence = summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? summary;
  const clause = sentence.split(":")[0].trim();
  const words = clause.split(/\s+/);
  const short = words.length > 16 ? `${words.slice(0, 16).join(" ")}…` : clause;
  return /[.!?…]$/.test(short) ? short : `${short}.`;
}

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
      .select("conversation_id, score, summary, red_flags, questions_to_ask, views")
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

    // Without the card agent's headline: the Judge's headline written to this
    // reader ("you" and "this match"), or else a short cut of the summary.
    const view = report.views?.[mySide];
    const fallbackHeadline = view?.headline ? fillMatch(view.headline) : shortLine(report.summary);
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
      headline: card?.headline ?? fallbackHeadline,
      tags,
    });
  });
  return result;
}

export function TagChip({ tag }: { tag: Tag }) {
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
