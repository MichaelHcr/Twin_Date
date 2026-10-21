import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TOPICS } from "@/lib/profile-topics";

// The Profile Checker. The profile form is the user's own word and the interview
// never changes it. This agent writes a short summary of what the interview
// added, and lists places where the interview contradicts the form (for example
// "Like pets" on the form but "I don't want pets" in the interview), so the user
// can review and reconcile them. Runs as the signed-in user.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const CheckSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentences to the user (\"you\") on what the interview added beyond the form"),
  conflicts: z
    .array(
      z.object({
        topic: z.string().describe("The form topic key, for example 'pets'"),
        profile_says: z.string().describe("The form answer, copied exactly"),
        interview_says: z.string().describe("What the user said in the interview, quoted or closely paraphrased"),
        note: z.string().describe("One short sentence on why these don't fit together"),
      }),
    )
    .describe("Real contradictions only; empty if none"),
});

export type Conflict = z.infer<typeof CheckSchema>["conflicts"][number] & { dismissed?: boolean };
export type ProfileCheck = { summary: string; conflicts: Conflict[]; checked_at: string };

const SYSTEM_PROMPT = `You compare a dating-app user's profile form with what they said in an onboarding interview with an AI interviewer.

The form is the source of truth and is never changed automatically. Your job is to spot real contradictions so the user can review them.

- A conflict is when the interview clearly says something incompatible with a form answer: the form says "Like pets, don't want my own" and the interview says "I really want a dog", or the form says "Never" for smoking and the interview says "I smoke when I drink".
- Extra detail, nuance, jokes, or hypotheticals are not conflicts. "Saver" on the form and "I splurged on one concert" is not a conflict.
- A topic skipped on the form is not a conflict.
- Only use form topic keys from the form answers you're given.
- Write the summary to the user as "you", warmly and briefly, about what the interview added (work, stories, personality), not a repeat of the form.`;

const key = (c: { topic: string; interview_says: string }) =>
  `${c.topic}|${c.interview_says.toLowerCase().replace(/\s+/g, " ").trim()}`;

export async function checkProfile(supabase: SupabaseClient, userId: string): Promise<ProfileCheck | null> {
  const [{ data: answers }, { data: facts }, { data: messages }, { data: previous }] = await Promise.all([
    supabase.from("profile_answers").select("topic, answer").eq("user_id", userId),
    supabase.from("interview_facts").select("topic, answer").eq("user_id", userId),
    supabase
      .from("interview_messages")
      .select("role, content")
      .eq("user_id", userId)
      .eq("role", "user")
      .order("id", { ascending: true }),
    supabase.from("profile_checks").select("conflicts").eq("user_id", userId).maybeSingle(),
  ]);
  if (!messages?.length) return null;

  const formTopics = new Set(TOPICS.map((t) => t.key));
  const form = (answers ?? []).filter((a) => formTopics.has(a.topic));

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: betaZodOutputFormat(CheckSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<form_answers>\n${JSON.stringify(form)}\n</form_answers>

<interview_notes>\n${JSON.stringify(facts ?? [])}\n</interview_notes>

<user_interview_messages>\n${messages.map((m) => m.content).join("\n")}\n</user_interview_messages>`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`The Profile Checker returned nothing (stop_reason: ${response.stop_reason}).`);
  }

  // Only flag topics the form actually answered, and keep earlier "my profile is right" choices.
  const formAnswer = new Map(form.map((a) => [a.topic, a.answer]));
  const dismissed = new Set(((previous?.conflicts ?? []) as Conflict[]).filter((c) => c.dismissed).map(key));
  const conflicts: Conflict[] = response.parsed_output.conflicts
    .filter((c) => formAnswer.has(c.topic))
    .map((c) => ({ ...c, profile_says: formAnswer.get(c.topic)!, dismissed: dismissed.has(key(c)) }));

  const check = { summary: response.parsed_output.summary, conflicts, checked_at: new Date().toISOString() };
  const { error } = await supabase.from("profile_checks").upsert({ user_id: userId, ...check });
  if (error) throw new Error(`Couldn't save the profile check: ${error.message}`);
  return check;
}

// The stored check, re-run first if the form or the interview changed since.
// Null before the user has said anything in the interview.
export async function loadProfileCheck(supabase: SupabaseClient, userId: string): Promise<ProfileCheck | null> {
  const [{ data: stored }, { data: profile }, { data: lastFact }, { data: lastMessage }] = await Promise.all([
    supabase.from("profile_checks").select("summary, conflicts, checked_at").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("updated_at").eq("user_id", userId).single(),
    supabase
      .from("interview_facts")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("interview_messages")
      .select("created_at")
      .eq("user_id", userId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!lastMessage) return null;
  const changed = [profile?.updated_at, lastFact?.updated_at, lastMessage.created_at]
    .filter(Boolean)
    .some((t) => !stored || new Date(t as string) > new Date(stored.checked_at));
  if (stored && !changed) return stored as ProfileCheck;
  return checkProfile(supabase, userId);
}
