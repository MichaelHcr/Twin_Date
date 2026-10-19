import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// The match card's short version of a Judge report: one line and a few tags,
// like a dating-app card ("Kids: aligned", "Hiking", "Ask: moving?"). It reads
// only the finished report, which both people can already see, and is cached
// in reports.card_json (migration 0010), so each report is summarized once.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const MatchCardSchema = z.object({
  headline: z
    .string()
    .describe("One sentence of 8-16 words on why they fit, e.g. 'Both want kids in a few years, love weekend hikes, and split costs evenly.'"),
  tags: z
    .array(
      z.object({
        label: z.string().describe("1-3 words, e.g. 'Kids: aligned', 'Hiking', 'Ask: moving?', 'Smoking'"),
        kind: z.enum(["aligned", "ask", "flag"]),
      }),
    )
    .describe("2-4 tags: things they share (aligned), one open question to ask (ask), dealbreakers (flag)"),
});

export type MatchCard = z.infer<typeof MatchCardSchema>;

const SYSTEM_PROMPT = `You write the front of a match card in Twin Date, a dating app. Two AI twins had a first chat and a Judge wrote a report. Turn the report into a card someone can read in two seconds.

- headline: one plain sentence, 8-16 words, about what they share or how they'd fit. No names, no "Member A/B", no scores.
- tags: 2-4 very short tags. "aligned" for something they share (a value, plan or hobby: "Kids: aligned", "Hiking"). "ask" for the most useful open question, phrased as "Ask: <2-3 words>?" ("Ask: moving?"). "flag" only for a real dealbreaker from the report's red flags.
- Use only what the report says. Don't invent shared interests.`;

type Report = {
  summary: string;
  red_flags: string[];
  questions_to_ask: string[];
  evidence_json: { quote: string; why: string }[];
};

// Returns the cached card, or writes one. Returns null if the card can't be
// stored yet (migration 0010 not applied) or the model gives no answer; the
// page then falls back to the report's own text.
export async function ensureMatchCard(admin: SupabaseClient, conversationId: string): Promise<MatchCard | null> {
  const { data, error } = await admin
    .from("reports")
    .select("summary, red_flags, questions_to_ask, evidence_json, card_json")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error || !data) return null;
  const cached = MatchCardSchema.safeParse(data.card_json);
  if (cached.success) return cached.data;

  const report = data as Report;
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(MatchCardSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<summary>${report.summary}</summary>
<red_flags>${JSON.stringify(report.red_flags ?? [])}</red_flags>
<questions_to_ask>${JSON.stringify(report.questions_to_ask ?? [])}</questions_to_ask>
<evidence>${JSON.stringify((report.evidence_json ?? []).map((e) => e.why))}</evidence>`,
      },
    ],
  });
  const card = response.parsed_output;
  if (response.stop_reason === "refusal" || !card) return null;
  card.tags = card.tags.slice(0, 4);

  await admin.from("reports").update({ card_json: card }).eq("conversation_id", conversationId);
  return card;
}
