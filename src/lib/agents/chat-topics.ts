import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// Topics for a real chat that has gone quiet. Reads the twins' first chat (both
// people can already see it) and the real chat so far, and picks specific
// things the twins talked about (a place, a show, a hobby) that the two people
// haven't brought up yet. Each comes with a short line either person could send.
// Cached in chat_topics (migration 0012) until someone sends a new message.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const TopicSchema = z.object({
  about: z.string().describe("What it's about, 2-8 words, e.g. 'the birria place on 3rd'"),
  line_for_a: z.string().describe("A casual message Member A could send to bring it up, under 20 words, no names"),
  line_for_b: z.string().describe("A casual message Member B could send to bring it up, under 20 words, no names"),
});

const TopicsSchema = z.object({
  topics: z.array(TopicSchema).describe("Up to 5 topics, best first; empty if there's nothing the people haven't covered"),
});

export type ChatTopic = z.infer<typeof TopicSchema>;

const SYSTEM_PROMPT = `You help two people on Twin Date, a dating app, restart a chat that has gone quiet. Before they matched, their AI twins (Member A and Member B) had a first chat for them. Now the two real people chat, and nobody has written for a couple of days.

Pick up to 5 specific things the twins talked about (a place, a show, a hobby, a plan, a story, a recommendation) that the real people haven't brought up in their own chat yet. Only threads from the twins' chat: not general shared interests, not anything the people already discussed. If there are none, return an empty list.

For each, write one casual message each person could send, in their own voice, that brings it up naturally ("Still thinking about that birria place on 3rd. Worth the hype?"). Keep it warm and low-pressure: no heavy topics like kids, money or moving, no names, under 20 words. Only use what's in the chats; don't invent details.`;

type Line = { speaker: string; content: string };

// Returns cached topics written after the latest real message, or writes new
// ones. Returns null if they can't be stored (migration 0012 not applied) or
// the model gives no answer; the chat then falls back to the report's questions.
export async function ensureChatTopics(
  admin: SupabaseClient,
  conversationId: string,
  lastMessageId: number,
): Promise<ChatTopic[] | null> {
  const { data: cached, error } = await admin
    .from("chat_topics")
    .select("based_on_message_id, topics")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) return null;
  if (cached && cached.based_on_message_id === lastMessageId) {
    const parsed = TopicsSchema.shape.topics.safeParse(cached.topics);
    if (parsed.success) return parsed.data;
  }

  const [{ data: twins }, { data: real }, { data: convo }] = await Promise.all([
    admin.from("messages").select("speaker, content").eq("conversation_id", conversationId).order("turn").order("id"),
    admin
      .from("chat_messages")
      .select("sender_id, content")
      .eq("conversation_id", conversationId)
      .order("created_at")
      .order("id"),
    admin.from("conversations").select("user_a").eq("id", conversationId).single(),
  ]);
  if (!twins?.length || !convo) return null;

  const twinChat = (twins as Line[]).map((m) => `Member ${m.speaker.toUpperCase()}'s twin: ${m.content}`).join("\n");
  const realChat = ((real ?? []) as { sender_id: string; content: string }[])
    .map((m) => `Member ${m.sender_id === convo.user_a ? "A" : "B"}: ${m.content}`)
    .join("\n");

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: "low", format: betaZodOutputFormat(TopicsSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<twins_first_chat>
${twinChat}
</twins_first_chat>

<real_chat_so_far>
${realChat || "(nothing yet)"}
</real_chat_so_far>`,
      },
    ],
  });
  const topics = response.parsed_output?.topics.slice(0, 5);
  if (response.stop_reason === "refusal" || !topics?.length) return null;

  await admin
    .from("chat_topics")
    .upsert({ conversation_id: conversationId, based_on_message_id: lastMessageId, topics });
  return topics;
}
