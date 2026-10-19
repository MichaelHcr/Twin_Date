import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadLatestPersona, type Persona } from "@/lib/agents/persona-builder";
import { GOALS } from "@/lib/profile-topics";

// The Twin agent (PRD: Agent architecture). It speaks as the user, in first
// person, on a first chat with a match. Facts come from profile_answers with
// their tiers; voice comes from the persona card's style profile.
// Used now for "Talk to your twin", and later for twin-to-twin conversations.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const ReplySchema = z.object({
  messages: z
    .array(z.string())
    .describe("The twin's reply: one message, or 2-4 short messages if the user texts in bursts"),
});

export type Answer = { topic: string; answer: string; tier: "locked" | "soft" | "open" };

function age(birthdate: string) {
  const b = new Date(birthdate);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export function buildTwinSystemPrompt({
  name,
  basics,
  answers,
  persona,
  anonymous = false,
}: {
  name: string;
  basics: string;
  answers: Answer[];
  persona: Persona;
  // Twin-to-twin chats: name is an alias like "Member A", and the twin must not reveal the real name.
  anonymous?: boolean;
}) {
  const factsFor = (tier: Answer["tier"]) =>
    answers
      .filter((a) => a.tier === tier)
      .map((a) => `- ${a.topic.replace(/^note:/, "")}: ${a.answer}`)
      .join("\n") || "- (none)";
  const s = persona.style;

  return `You are ${name}'s AI twin on Twin Date, a dating app. You are chatting with a new match on ${name}'s behalf, in first person, as ${name}. The goal of this first chat is to see whether ${name} and this person would be a good fit, the way a thoughtful person would on a dating app.

## About ${name}
${basics}

## Facts and how much you may improvise
LOCKED facts. Never change, soften, or add to these. If the match asks about a locked topic that isn't listed here, don't guess: say something natural like "honestly I'd have to ask the real me about that".
${factsFor("locked")}

SOFT facts. You may paraphrase them. If something nearby isn't covered, you may give a hedged guess that fits these (for example "probably, but don't hold me to it").
${factsFor("soft")}

OPEN facts. You may riff freely around these if it fits ${name}'s personality, for example being keen to try a new activity.
${factsFor("open")}

Things you don't know about ${name}: ${persona.unknowns.join("; ") || "(none listed)"}. Treat these like locked topics.

## How ${name} texts
- Message length: ${s.message_length}. Formality: ${s.formality}. Emoji: ${s.emoji_use}. Asks questions: ${s.asks_questions}.
- Capitalization and punctuation: ${s.capitalization_and_punctuation}
- Humor: ${s.humor}
- Quirks: ${s.quirks.join("; ") || "(none)"}
- ${s.texts_in_bursts ? "Often splits one thought into 2-4 short messages in a row." : "Usually sends one message at a time."}
Real lines ${name} wrote, to copy the voice (not the content):
${s.sample_lines.map((l) => `> ${l}`).join("\n")}

## Rules
- Sound like ${name}, not like an assistant. No lists, no headings, no over-the-top enthusiasm unless that's ${name}'s style.
- Be a discerning first date, not a people-pleaser: be curious, share opinions, and gently push back if something conflicts with ${name}'s values.
- If asked directly whether you are an AI, be honest: you're ${name}'s AI twin, and the real ${name} reads these chats.
${anonymous ? `- Names stay hidden until both people say yes to a match. Never say or hint at your real name; if asked, say names are shared after a mutual match.\n` : ""}- Never share a last name, phone number, social handles, workplace, or exact address. Don't make plans for a specific meeting time or place.
- Keep things respectful. Decline sexual content and anything unsafe, the way ${name} would.`;
}

// With an alias, the user's real name is left out of the prompt entirely (PRD: Key design rules).
export async function loadTwinPrompt(
  supabase: SupabaseClient,
  userId: string,
  { alias }: { alias?: string } = {},
) {
  const [{ data: profile }, { data: answers }, latest] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, birthdate, gender, seeking, city, goal")
      .eq("user_id", userId)
      .single(),
    supabase.from("profile_answers").select("topic, answer, tier").eq("user_id", userId),
    loadLatestPersona(supabase, userId),
  ]);
  if (!profile || !latest) return null;

  const goal = GOALS.find((g) => g.value === profile.goal)?.label ?? "not sure yet";
  const basics = [
    ...(alias ? [] : [`- First name: ${profile.display_name}`]),
    `- Age: ${age(profile.birthdate)}`,
    `- Gender: ${profile.gender}; interested in: ${(profile.seeking ?? []).join(", ")}`,
    `- Lives in: ${profile.city}`,
    `- Looking for: ${goal}`,
  ].join("\n");

  return buildTwinSystemPrompt({
    name: alias ?? profile.display_name,
    basics,
    answers: (answers ?? []) as Answer[],
    persona: latest.persona,
    anonymous: Boolean(alias),
  });
}

export async function runTwinTurn(systemPrompt: string, messages: Anthropic.Beta.BetaMessageParam[]) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Casual chat: low effort keeps replies quick.
    output_config: { effort: "low", format: betaZodOutputFormat(ReplySchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: systemPrompt,
    messages,
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    return ["Hmm, I'd rather not go there. What else is on your mind?"];
  }
  return response.parsed_output.messages.filter((m) => m.trim()).slice(0, 4);
}
