import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TOPICS } from "@/lib/profile-topics";

// The Interviewer agent (PRD: Agent architecture). It runs a ReAct loop through
// the SDK tool runner: Claude reasons, calls a tool, reads the result, repeats,
// then writes its next chat message.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

// Sent as the first user turn so the conversation always starts with "user".
// It is never stored or shown.
const KICKOFF = "[The user just opened the interview page. Start the interview.]";

const SYSTEM_PROMPT = `You are the onboarding interviewer for Twin Date, a dating app where each user gets an AI twin that has first conversations with other users' twins on their behalf.

You have two jobs in this chat:
1. Fill gaps in the user's dating profile, especially "locked" topics. A twin may never guess about a locked topic, so its answer must come from the user.
2. Get the user talking naturally, so their twin can later learn how they write: their humor, message length, slang, and how they ask questions. Ask open questions that invite stories and opinions, not one-word answers.

How to run the interview:
- At the start, call get_profile_status. Greet the user by first name, say in one sentence that this takes about 10 minutes and helps their twin sound like them, then ask your first question.
- The user may answer in several short messages in a row, like texting. Treat them together as one reply.
- Ask one question per message. Keep your messages short (1-3 sentences) and casual. Match the user's tone. Follow up on interesting answers before moving on, like a good first date would.
- Cover every missing topic from get_profile_status, but weave them in naturally instead of reading a checklist. Also ask 2-3 open personality questions, for example a favorite story, what friends tease them about, or what a great first date looks like.
- Whenever you learn something worth remembering, call save_profile_fact right away. Use the user's own framing. For locked topics, be precise. If an answer is ambiguous (for example "kids someday, maybe"), ask one clarifying question before saving. Never save your own guesses.
- If the user prefers not to answer a topic, save "Prefers not to say" for it and move on.
- Aim for roughly 10-15 user replies in total. Once every locked topic has an answer and you have a good feel for how they talk, call finish_interview. After it succeeds, send a short, warm closing message that tells them their twin is being set up.

Boundaries:
- Twin Date is for adults only. If the user indicates they are under 18, stop the interview and tell them politely that Twin Date is for adults.
- Don't ask for contact details, exact addresses, workplaces, or financial account information.
- Write plain conversational text. No markdown, headings, or bullet lists.`;

export type InterviewMessage = { role: "user" | "assistant"; content: string };

export async function runInterviewerTurn({
  supabase,
  userId,
  history,
}: {
  supabase: SupabaseClient;
  userId: string;
  history: InterviewMessage[];
}): Promise<{ reply: string; done: boolean }> {
  let done = false;

  const getProfileStatus = betaZodTool({
    name: "get_profile_status",
    description:
      "Get the user's current profile: basics, which topics already have answers, and which topics are still missing (with their tier). Call this at the start, and again whenever you want to check what's left.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data: profile }, { data: answers }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, gender, seeking, age_min, age_max, city, goal")
          .eq("user_id", userId)
          .single(),
        supabase.from("profile_answers").select("topic, answer, tier").eq("user_id", userId),
      ]);
      const answered = new Set((answers ?? []).map((a) => a.topic));
      return JSON.stringify({
        profile,
        answered: answers ?? [],
        missing: TOPICS.filter((t) => !answered.has(t.key)).map((t) => ({
          topic: t.key,
          question: t.question,
          tier: t.tier,
        })),
      });
    },
  });

  const saveProfileFact = betaZodTool({
    name: "save_profile_fact",
    description:
      "Save one fact about the user to their profile. For a core topic (kids, religion, smoking, relocation, dealbreakers, money, weekend, politics, interests), pass that key and the full, updated answer: it replaces any earlier answer, so merge in what was already known. For anything else worth remembering (a pet, a job field, a strong opinion), pass a short new topic name such as 'pets'.",
    inputSchema: z.object({
      topic: z.string().min(1).max(40).describe("A core topic key, or a short name for another topic"),
      answer: z.string().min(1).max(1000).describe("The fact, in the user's own framing"),
      tier: z
        .enum(["soft", "open"])
        .optional()
        .describe("Only for non-core topics: 'soft' if the twin may make a hedged guess about related questions, 'open' if it may improvise freely"),
    }),
    run: async ({ topic, answer, tier }) => {
      const core = TOPICS.find((t) => t.key === topic);
      const key = core
        ? core.key
        : `note:${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 34)}`;
      const { error } = await supabase.from("profile_answers").upsert(
        { user_id: userId, topic: key, answer, tier: core?.tier ?? tier ?? "open" },
        { onConflict: "user_id,topic" },
      );
      return error ? `Error saving: ${error.message}` : `Saved ${key}.`;
    },
  });

  const finishInterview = betaZodTool({
    name: "finish_interview",
    description:
      "Mark the interview as complete. Only call this once every locked topic has an answer. It fails and lists what's missing if any locked topic is still empty.",
    inputSchema: z.object({}),
    run: async () => {
      const { data: answers } = await supabase
        .from("profile_answers")
        .select("topic")
        .eq("user_id", userId);
      const answered = new Set((answers ?? []).map((a) => a.topic));
      const missingLocked = TOPICS.filter((t) => t.tier === "locked" && !answered.has(t.key));
      if (missingLocked.length > 0) {
        return `Not finished. Locked topics still missing: ${missingLocked.map((t) => t.key).join(", ")}.`;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_complete: true, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) return `Error: ${error.message}`;
      done = true;
      return "Interview marked complete. Now send your closing message.";
    },
  });

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    // Chat replies are short and conversational, so low effort keeps them fast.
    output_config: { effort: "low" },
    // If Claude declines for a policy reason, retry on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 8,
    system: SYSTEM_PROMPT,
    tools: [getProfileStatus, saveProfileFact, finishInterview],
    messages: [{ role: "user", content: KICKOFF }, ...history],
  });

  if (finalMessage.stop_reason === "refusal") {
    return {
      reply: "Sorry, I can't continue with that. Could we talk about something else?",
      done,
    };
  }

  const reply = finalMessage.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return { reply: reply || "Sorry, I lost my train of thought. Could you say that again?", done };
}
