import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadLatestPersona } from "@/lib/agents/persona-builder";

// The Judge agent (PRD: Agent architecture). After a twin-to-twin conversation
// ends, it reads the transcript, both private ledgers and both persona cards, and
// writes the report both people see. Needs the admin client: ledgers have no
// browser access at all.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

// A conversation that ended on a locked dealbreaker can't score above this.
const RED_FLAG_SCORE_CAP = 20;

export const ReportSchema = z.object({
  score: z.number().int().min(0).max(100).describe("How promising this match is, 0-100"),
  summary: z
    .string()
    .describe("3-5 sentences on how the chat went and why this score, for both people to read"),
  evidence: z
    .array(
      z.object({
        speaker: z.enum(["a", "b"]),
        quote: z.string().describe("Copied exactly from one message in the transcript"),
        why: z.string().describe("What this shows, in one sentence"),
      }),
    )
    .describe("3-6 quotes that most support the score, good and bad"),
  red_flags: z
    .array(z.string())
    .describe("Real conflicts on values or dealbreakers, one sentence each; empty if none"),
  questions_to_ask: z
    .array(z.string())
    .describe("3-5 specific questions to ask in person, especially about anything left unresolved"),
});

export type Report = z.infer<typeof ReportSchema>;

const SYSTEM_PROMPT = `You are the Judge for Twin Date, a dating app where each user's AI twin has a first chat with another user's twin. Both people will read your report to decide whether to meet.

You receive the transcript (Member A and Member B), each twin's private notes (its ledger), each person's persona highlights, and how the conversation ended.

Score how promising this match is:
- 0-20: a dealbreaker conflict (kids, religion, smoking, relocation, a stated dealbreaker)
- 21-50: significant concerns or mismatched goals
- 51-75: promising, with real open questions
- 76-100: strong match on the big things, with genuine chemistry
Weigh relationship goals, kids, money, lifestyle and location, values, and how well they actually got along.

Rules:
- Base everything on what was said in the transcript. Twins may improvise on minor topics, so treat ledger assumptions and anything unconfirmed as open questions, not facts.
- Evidence quotes must be copied exactly from a single message.
- Call them Member A and Member B. Never include names, contact details, workplaces or addresses.
- Be honest and specific, not a cheerleader. A short chat that ended early still gets a fair score for what it showed.`;

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function judgeConversation(admin: SupabaseClient, conversationId: string) {
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, user_a, user_b, status, end_reason, turn_count")
    .eq("id", conversationId)
    .single();
  if (!conversation) throw new Error(`No conversation ${conversationId}.`);
  if (conversation.status !== "ended") throw new Error("The conversation hasn't ended yet.");

  const [{ data: messages }, { data: ledgers }, personaA, personaB] = await Promise.all([
    admin
      .from("messages")
      .select("speaker, content, turn")
      .eq("conversation_id", conversationId)
      .order("turn")
      .order("id"),
    admin
      .from("ledgers")
      .select("owner, pros, cons, red_flags, assumptions, open_questions")
      .eq("conversation_id", conversationId),
    loadLatestPersona(admin, conversation.user_a),
    loadLatestPersona(admin, conversation.user_b),
  ]);
  if (!messages?.length) throw new Error("The conversation has no messages to judge.");

  const transcript = messages
    .map((m) => `[turn ${m.turn}] Member ${m.speaker.toUpperCase()}: ${m.content}`)
    .join("\n");
  const ledgerOf = (side: "a" | "b") => {
    const ledger = ledgers?.find((l) => l.owner === side);
    if (!ledger) return "{}";
    const { pros, cons, red_flags, assumptions, open_questions } = ledger;
    return JSON.stringify({ pros, cons, red_flags, assumptions, open_questions });
  };
  // Highlights and unknowns only: the persona summary may mention a real name.
  const personaOf = (p: typeof personaA) =>
    JSON.stringify({ highlights: p?.persona.highlights ?? [], unknowns: p?.persona.unknowns ?? [] });

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<how_it_ended>${conversation.end_reason} after ${conversation.turn_count} turns</how_it_ended>

<transcript>
${transcript}
</transcript>

<member_a_ledger>${ledgerOf("a")}</member_a_ledger>
<member_b_ledger>${ledgerOf("b")}</member_b_ledger>

<member_a_persona>${personaOf(personaA)}</member_a_persona>
<member_b_persona>${personaOf(personaB)}</member_b_persona>`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`The Judge returned no report (stop_reason: ${response.stop_reason}).`);
  }
  const report = response.parsed_output;

  // Rules that must hold are enforced here, not only in the prompt.
  if (conversation.end_reason === "red_flag") {
    report.score = Math.min(report.score, RED_FLAG_SCORE_CAP);
  }
  const said = messages.map((m) => ({ speaker: m.speaker, text: normalize(m.content) }));
  report.evidence = report.evidence.filter((e) =>
    said.some((m) => m.speaker === e.speaker && m.text.includes(normalize(e.quote))),
  );

  const { error } = await admin.from("reports").upsert({
    conversation_id: conversationId,
    score: report.score,
    summary: report.summary,
    evidence_json: report.evidence,
    red_flags: report.red_flags,
    questions_to_ask: report.questions_to_ask,
  });
  if (error) throw new Error(`Couldn't save report: ${error.message}`);

  return report;
}
