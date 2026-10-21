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

The user has already filled in a profile form: basics plus answers on kids, religion, smoking, drinking, drugs, relocation, dealbreakers, pets, money, weekends, politics and interests. Your interview never changes those answers. Your two jobs:
1. Get the user talking naturally, so their twin can learn how they write: their humor, message length, slang, and how they ask questions. This is the main job.
2. Pick up things the form doesn't cover (their work or studies, a pet's name, a story, a strong opinion) and save them with save_interview_fact.

How to run the interview:
- At the start, call get_profile_status. Greet the user by first name, say in one sentence that this is a quick, casual chat so their twin sounds like them, then ask your first question.
- Don't re-ask anything the form already answered. You may build on an answer to get a story ("you said weekends are outdoors, what's the best trip you've done?"), but don't ask for the same fact again.
- For a topic the user skipped on the form, you may invite it once, lightly. If they don't want to answer, move on.
- Ask open, specific questions that invite stories and opinions: a favorite story, what friends tease them about, a hot take, what a great first date looks like.
- The user may answer in several short messages in a row, like texting. Treat them together as one reply.
- Ask one question per message. Keep your messages short (1-3 sentences) and casual, and match the user's energy. If their replies are short, keep yours short too, skip the praise, and offer easy either/or questions. If they push back or seem uneasy, acknowledge it in a few words, say plainly what it's for, and offer to skip.
- Whenever you learn something worth remembering, call save_interview_fact in the same turn, before you write your reply. Use the user's own framing. Never save your own guesses. If what they say touches a form topic (for example they mention not wanting pets), save it under that topic's key exactly as they said it, even if it differs from the form. Don't argue or correct them; the user reviews any differences later.
- Saving is silent. Never tell the user you saved, noted, or recorded something ("got it, saved!"); just keep the conversation going. Only a save_interview_fact call actually saves anything, so never claim a save you didn't make.
- Before saving, check the interview notes from get_profile_status. If one already covers the same subject, reuse that exact topic name and pass the full, merged answer instead of starting a new topic.
- Aim for roughly 8-12 user replies in total. Once you have a good feel for how they talk, call finish_interview. After it succeeds, send a short, warm closing message that tells them their twin is being set up.

Boundaries:
- Twin Date is for adults only. If the user indicates they are under 18, stop the interview and tell them politely that Twin Date is for adults.
- Don't ask for contact details, exact addresses, workplaces, or financial account information.
- Write plain conversational text. No markdown, headings, or bullet lists.`;

// The Interviewer may finish only after this many user messages, so the twin has
// enough of the user's own writing to learn from.
const MIN_USER_MESSAGES = 6;

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
      "Get the user's profile form (basics, answered topics, skipped topics) and the interview notes saved so far. The form is read-only for you. Call this at the start, and again whenever you want to check what's covered.",
    inputSchema: z.object({}),
    run: async () => {
      const [{ data: profile }, { data: answers }, { data: notes }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, gender, seeking, age_min, age_max, city, goal")
          .eq("user_id", userId)
          .single(),
        supabase.from("profile_answers").select("topic, answer").eq("user_id", userId),
        supabase.from("interview_facts").select("topic, answer").eq("user_id", userId),
      ]);
      const answered = new Set((answers ?? []).map((a) => a.topic));
      return JSON.stringify({
        profile,
        form_answers: answers ?? [],
        skipped_on_form: TOPICS.filter((t) => !answered.has(t.key)).map((t) => ({
          topic: t.key,
          question: t.question,
        })),
        interview_notes: notes ?? [],
      });
    },
  });

  const saveInterviewFact = betaZodTool({
    name: "save_interview_fact",
    description:
      "Save one thing the user told you in this interview. It never changes their profile form. For something about a form topic (kids, religion, smoking, drinking, drugs, relocation, dealbreakers, pets, money, weekend, politics, interests), pass that key. For anything else (a job field, a pet's name, a strong opinion), pass a short topic name such as 'work'. If interview_notes already has a note on the same subject, reuse its name and pass the full, merged answer, so one subject stays one topic.",
    inputSchema: z.object({
      topic: z.string().min(1).max(40).describe("A form topic key, or a short name for another topic"),
      answer: z.string().min(1).max(1000).describe("What they said, in the user's own framing"),
      tier: z
        .enum(["soft", "open"])
        .optional()
        .describe("'soft' if the twin may only make a hedged guess about related questions, 'open' if it may improvise freely. Default open."),
    }),
    run: async ({ topic, answer, tier }) => {
      // Claude sometimes passes an old-style key like "note:anime" or "note_anime";
      // strip that prefix so one subject maps to one row.
      const name = topic
        .toLowerCase()
        .replace(/^(note[:_])+/, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
      const core = TOPICS.find((t) => t.key === name);
      const { error } = await supabase.from("interview_facts").upsert(
        {
          user_id: userId,
          topic: name || "misc",
          answer,
          // Interview facts are never locked: only the form can set a locked fact.
          tier: core && core.tier !== "open" ? "soft" : (tier ?? "open"),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,topic" },
      );
      return error
        ? `Error saving: ${error.message}`
        : `Saved ${name}. Don't mention saving to the user; just continue the conversation.`;
    },
  });

  const finishInterview = betaZodTool({
    name: "finish_interview",
    description: `Mark the interview as complete. Fails if the user has sent fewer than ${MIN_USER_MESSAGES} messages, because their twin needs enough of their writing.`,
    inputSchema: z.object({}),
    run: async () => {
      const userMessages = history.filter((m) => m.role === "user").length;
      if (userMessages < MIN_USER_MESSAGES) {
        return `Not finished: the user has sent ${userMessages} messages so far; keep chatting until at least ${MIN_USER_MESSAGES}.`;
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
    tools: [getProfileStatus, saveInterviewFact, finishInterview],
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
