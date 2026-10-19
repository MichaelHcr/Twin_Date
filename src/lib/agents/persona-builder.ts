import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ageOn } from "@/lib/age";

// The Persona Builder agent (PRD: Agent architecture). It reads the profile,
// topic answers and interview transcript, and writes a persona card: a
// user-facing summary plus a style profile the twin uses to sound like the user.
// Facts are not copied into the card; twins read them straight from
// profile_answers, so locked facts always come from the user.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const PersonaSchema = z.object({
  summary: z
    .string()
    .describe("3-4 warm sentences to the user, in second person, on how their twin will come across"),
  highlights: z
    .array(z.string())
    .describe("3-6 short things the twin is likely to bring up or bond over"),
  style: z.object({
    message_length: z.enum(["very short", "short", "medium", "long"]),
    texts_in_bursts: z
      .boolean()
      .describe("True if the user tends to split one thought across several short messages"),
    formality: z.enum(["casual", "balanced", "formal"]),
    capitalization_and_punctuation: z
      .string()
      .describe("e.g. 'all lowercase, rarely uses periods' or 'standard, uses exclamation marks'"),
    humor: z.string().describe("The kind of humor, or 'rarely jokes'"),
    emoji_use: z.enum(["none", "rare", "some", "frequent"]),
    asks_questions: z.enum(["rarely", "sometimes", "often"]),
    quirks: z.array(z.string()).describe("Recurring words, slang, or habits"),
    sample_lines: z
      .array(z.string())
      .describe("5-10 lines copied verbatim from the user's own interview messages that best show their voice"),
  }),
  unknowns: z
    .array(z.string())
    .describe("Topics a first date might raise that the twin knows nothing about"),
});

export type Persona = z.infer<typeof PersonaSchema>;

const SYSTEM_PROMPT = `You build persona cards for Twin Date, a dating app where each user's AI twin has first conversations with other users' twins.

You receive one user's profile, their topic answers, and their onboarding interview transcript. Produce a persona card that lets the twin sound like this person.

- Base the style profile only on the user's own messages, not the interviewer's.
- asks_questions: in an interview the user mostly answers and rarely gets the chance to ask anything, so the transcript understates how often they ask questions. Default to "sometimes". Use "often" if they asked questions even here, and "rarely" only if they clearly avoided questions when given an opening (for example when invited to ask the interviewer something).
- sample_lines must be copied exactly from the user's messages, including typos, casing and emoji.
- Don't invent facts. If something isn't in the material, it belongs in unknowns, not in the summary or highlights.
- Write the summary to the user ("you"), warmly and specifically. Avoid generic praise.`;

export async function buildPersona(supabase: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: answers }, { data: transcript }, { data: latest }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, birthdate, gender, seeking, age_min, age_max, city, goal")
        .eq("user_id", userId)
        .single(),
      supabase.from("profile_answers").select("topic, answer, tier").eq("user_id", userId),
      supabase
        .from("interview_messages")
        .select("role, content")
        .eq("user_id", userId)
        .order("id", { ascending: true }),
      supabase
        .from("persona_cards")
        .select("version")
        .eq("user_id", userId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // Give the builder the user's age rather than the raw birthdate.
  const { birthdate, ...rest } = profile ?? {};
  const profileInfo = { ...rest, age: birthdate ? ageOn(birthdate) : null };

  const transcriptText = (transcript ?? [])
    .map((m) => `${m.role === "user" ? "USER" : "INTERVIEWER"}: ${m.content}`)
    .join("\n");

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(PersonaSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<profile>\n${JSON.stringify(profileInfo)}\n</profile>\n\n<topic_answers>\n${JSON.stringify(answers ?? [])}\n</topic_answers>\n\n<interview_transcript>\n${transcriptText}\n</interview_transcript>`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Persona Builder returned no card (stop_reason: ${response.stop_reason}).`);
  }
  const persona = response.parsed_output;

  const { style, ...card } = persona;
  const { error } = await supabase.from("persona_cards").insert({
    user_id: userId,
    version: (latest?.version ?? 0) + 1,
    card_json: card,
    style_json: style,
  });
  if (error) throw new Error(error.message);

  return persona;
}

export async function loadLatestPersona(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("persona_cards")
    .select("version, card_json, style_json, created_at")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    version: data.version as number,
    createdAt: data.created_at as string,
    persona: { ...data.card_json, style: data.style_json } as Persona,
  };
}
