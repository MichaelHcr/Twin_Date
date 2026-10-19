import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadTwinPrompt, ReplySchema } from "@/lib/agents/twin";
import { TOPICS } from "@/lib/profile-topics";

// The twin-to-twin Orchestrator (PRD: Twin-to-twin conversation). Plain code, not
// an LLM: it alternates turns between two Twin agents, enforces the turn cap, and
// stops early on a red flag. Each twin runs a ReAct loop with private tools for its
// ledger, and sees only its own ledger. Needs the admin client: it reads both users'
// profiles and writes conversations, messages and ledgers.

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const TURN_CAP = 20;
// A twin may not end the chat on its own before this turn (red flags excepted).
const MIN_TURNS_BEFORE_END = 6;
const LOCKED_TOPICS = TOPICS.filter((t) => t.tier === "locked").map((t) => t.key) as [
  string,
  ...string[],
];
const ALIASES = { a: "Member A", b: "Member B" } as const;

export type Side = "a" | "b";
export type EndReason = "turn_cap" | "red_flag" | "guardrail" | "all_topics_covered" | "not_a_fit";
export type Ledger = {
  pros: string[];
  cons: string[];
  red_flags: string[];
  assumptions: string[];
  open_questions: string[];
};
export type TranscriptTurn = { speaker: Side; turn: number; messages: string[] };

const emptyLedger = (): Ledger => ({
  pros: [],
  cons: [],
  red_flags: [],
  assumptions: [],
  open_questions: [],
});

function conversationRules(other: string) {
  return `

## This conversation
You're now in a first chat with another member's AI twin, ${other}. Their messages arrive as user messages; yours are the assistant messages. Both of you speak for real people, who will read this transcript and a report on it to decide whether to meet.

Over the chat, cover these naturally, like a real first conversation, not a checklist:
- what each of you is looking for
- kids
- money and how you like to live
- lifestyle and location, including whether you'd move
- one or two shared interests worth bonding over
Ask about them as much as you share about yourself. The chat lasts at most ${TURN_CAP} turns in total (about ${TURN_CAP / 2} replies each), so don't rush, but don't stall.

Your tools (the other twin never sees tool calls):
- update_ledger: your private notes on this match. Call it whenever you learn something that matters. Your current notes are shown to you at the start of each turn.
- flag_red_flag: only when they have clearly said something that conflicts with one of your LOCKED facts or dealbreakers (for example, you want kids and they said they never want kids). Don't flag a guess or a soft preference: ask first. Flagging ends the chat, so in the same turn send a short, kind goodbye.
- end_conversation: once the topics above are covered and you have a clear sense of fit, or you're confident it isn't a fit for reasons short of a dealbreaker. Send a natural closing message in the same turn.`;
}

// The per-turn status line the twin sees, with its own private ledger.
function turnNote(turn: number, ledger: Ledger) {
  const left = TURN_CAP - turn + 1;
  const wrapUp = left <= 4 ? ` Only ${left} turns left including this one: start wrapping up.` : "";
  return `[Twin Date: turn ${turn} of ${TURN_CAP}.${wrapUp} Your private notes so far: ${JSON.stringify(ledger)}]`;
}

// Rebuilds the chat from one side's point of view: its own turns are "assistant",
// the other twin's are "user". Side A gets a kickoff message so the chat starts with "user".
function historyFor(
  side: Side,
  transcript: TranscriptTurn[],
  turn: number,
  ledger: Ledger,
): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  if (side === "a") {
    messages.push({
      role: "user",
      content: `[Twin Date: you just matched with ${ALIASES.b}. You go first: open the conversation.]`,
    });
  }
  for (const t of transcript) {
    messages.push(
      t.speaker === side
        ? { role: "assistant", content: JSON.stringify({ messages: t.messages }) }
        : { role: "user", content: t.messages.join("\n") },
    );
  }
  // The chat must end on the other side's message. If a turn was lost, nudge instead.
  if (messages.length === 0 || messages.at(-1)!.role === "assistant") {
    messages.push({ role: "user", content: "[Twin Date: it's your turn to reply.]" });
  }
  // Attach the status line to the last user message.
  const last = messages.at(-1)!;
  last.content = [
    { type: "text", text: last.content as string },
    { type: "text", text: turnNote(turn, ledger) },
  ];
  return messages;
}

type TurnResult = { messages: string[]; end: EndReason | null };

async function runTwinConversationTurn({
  systemPrompt,
  messages,
  ledger,
  turn,
  lockedAnswers,
}: {
  systemPrompt: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  ledger: Ledger;
  turn: number;
  lockedAnswers: Map<string, string>;
}): Promise<TurnResult> {
  let end: EndReason | null = null;

  const updateLedger = betaZodTool({
    name: "update_ledger",
    description:
      "Add to your private notes on this match. Each item is one short sentence. open_questions, if given, replaces your list of open questions (drop the ones that got answered).",
    inputSchema: z.object({
      pros: z.array(z.string()).optional().describe("New things that make this a good match"),
      cons: z.array(z.string()).optional().describe("New concerns"),
      assumptions: z
        .array(z.string())
        .optional()
        .describe("Things you're assuming about them but haven't confirmed"),
      open_questions: z
        .array(z.string())
        .optional()
        .describe("The full, updated list of things you still want to find out"),
    }),
    run: async ({ pros, cons, assumptions, open_questions }) => {
      ledger.pros.push(...(pros ?? []));
      ledger.cons.push(...(cons ?? []));
      ledger.assumptions.push(...(assumptions ?? []));
      if (open_questions) ledger.open_questions = open_questions;
      return "Notes saved.";
    },
  });

  const flagRedFlag = betaZodTool({
    name: "flag_red_flag",
    description:
      "Flag a clear conflict between what they said and one of your LOCKED facts or dealbreakers. This ends the conversation after your reply this turn. Refused if you have no stated answer on that topic.",
    inputSchema: z.object({
      topic: z.enum(LOCKED_TOPICS).describe("Which of your locked topics it conflicts with"),
      their_words: z.string().describe("What they said, quoted or closely paraphrased"),
      conflict: z.string().describe("One sentence on why it conflicts with your locked answer"),
    }),
    run: async ({ topic, their_words, conflict }) => {
      const mine = lockedAnswers.get(topic);
      if (!mine || /prefers not to say/i.test(mine)) {
        return `Refused: you have no stated answer for ${topic}, so it can't be a dealbreaker. Ask about it, or note it with update_ledger.`;
      }
      ledger.red_flags.push(`${topic}: ${conflict} (they said: "${their_words}")`);
      end = "red_flag";
      return "Red flag recorded. The conversation ends after this turn. If this answered any of your open questions, update them with update_ledger, then send a short, kind goodbye.";
    },
  });

  const endConversation = betaZodTool({
    name: "end_conversation",
    description: `End the conversation after your reply this turn. Not allowed before turn ${MIN_TURNS_BEFORE_END}.`,
    inputSchema: z.object({
      reason: z.enum(["all_topics_covered", "not_a_fit"]),
      why: z.string().describe("One sentence"),
    }),
    run: async ({ reason, why }) => {
      if (turn < MIN_TURNS_BEFORE_END) {
        return `Refused: it's only turn ${turn}. Keep getting to know them; you can end from turn ${MIN_TURNS_BEFORE_END}.`;
      }
      if (reason === "not_a_fit") ledger.cons.push(`Not a fit: ${why}`);
      end = reason;
      return "The conversation ends after this turn. Send your closing message now.";
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    // Casual chat: low effort keeps turns quick.
    output_config: { effort: "low", format: betaZodOutputFormat(ReplySchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_iterations: 6,
    system: systemPrompt,
    tools: [updateLedger, flagRedFlag, endConversation],
    messages,
  });

  // The reply can come with or after tool calls, so keep the last one the twin wrote.
  let reply: string[] = [];
  for await (const message of runner) {
    if (message.stop_reason === "refusal") return { messages: [], end: "guardrail" };
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) continue;
    let parsed: z.infer<typeof ReplySchema> | null = null;
    try {
      parsed = ReplySchema.parse(JSON.parse(text));
    } catch {
      // Not valid JSON: use the raw text as a single message.
    }
    reply = parsed ? parsed.messages.filter((m) => m.trim()).slice(0, 4) : [text];
  }

  if (reply.length === 0) throw new Error(`Twin returned no reply on turn ${turn}.`);
  return { messages: reply, end };
}

async function loadLockedAnswers(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("profile_answers")
    .select("topic, answer")
    .eq("user_id", userId)
    .eq("tier", "locked");
  return new Map((data ?? []).map((a) => [a.topic as string, a.answer as string]));
}

// Conversations run one turn per call, so each call fits in a normal request:
// a web page can drive it turn by turn, and a script can loop. All state lives in
// the database (messages, ledgers, turn_count), so any call can pick up the next turn.

export async function createConversation(admin: SupabaseClient, userA: string, userB: string) {
  if (userA === userB) throw new Error("A conversation needs two different users.");
  const { data, error } = await admin
    .from("conversations")
    .insert({ user_a: userA, user_b: userB, status: "queued" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Couldn't create conversation: ${error?.message}`);
  return data.id as string;
}

async function loadTranscript(admin: SupabaseClient, conversationId: string) {
  const { data } = await admin
    .from("messages")
    .select("speaker, content, turn")
    .eq("conversation_id", conversationId)
    .order("turn")
    .order("id");
  const turns: TranscriptTurn[] = [];
  for (const m of data ?? []) {
    const last = turns.at(-1);
    if (last && last.turn === m.turn) last.messages.push(m.content);
    else turns.push({ speaker: m.speaker as Side, turn: m.turn, messages: [m.content] });
  }
  return turns;
}

export async function loadLedger(admin: SupabaseClient, conversationId: string, side: Side) {
  const { data } = await admin
    .from("ledgers")
    .select("pros, cons, red_flags, assumptions, open_questions")
    .eq("conversation_id", conversationId)
    .eq("owner", side)
    .maybeSingle();
  return (data as Ledger | null) ?? emptyLedger();
}

export type StepResult =
  | { status: "turn"; turn: TranscriptTurn | null; ended: boolean; endReason: EndReason | null }
  | { status: "already_ended" }
  | { status: "skipped" };

// Runs the next turn of a conversation and stores it. "skipped" means another
// call took this turn first (for example the page is open in two tabs).
export async function stepConversation(
  admin: SupabaseClient,
  conversationId: string,
): Promise<StepResult> {
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, user_a, user_b, status, turn_count, started_at")
    .eq("id", conversationId)
    .single();
  if (!conversation) throw new Error(`No conversation ${conversationId}.`);
  if (conversation.status === "ended") return { status: "already_ended" };

  const turn = conversation.turn_count + 1;
  const side: Side = turn % 2 === 1 ? "a" : "b";
  const other: Side = side === "a" ? "b" : "a";
  const userId = side === "a" ? conversation.user_a : conversation.user_b;

  // A failed turn leaves the conversation as it was, so the same turn can be retried.
  const [prompt, locked, transcript, ledger] = await Promise.all([
    loadTwinPrompt(admin, userId, { alias: ALIASES[side] }),
    loadLockedAnswers(admin, userId),
    loadTranscript(admin, conversationId),
    loadLedger(admin, conversationId, side),
  ]);
  if (!prompt) throw new Error("Both users need a completed profile and a persona card.");

  const result = await runTwinConversationTurn({
    systemPrompt: prompt + conversationRules(ALIASES[other]),
    messages: historyFor(side, transcript, turn, ledger),
    ledger,
    turn,
    lockedAnswers: locked,
  });

  // Claim the turn; if another call already stored it, drop this one.
  const { data: claimed } = await admin
    .from("conversations")
    .update({
      status: "running",
      turn_count: turn,
      started_at: conversation.started_at ?? new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("turn_count", conversation.turn_count)
    .neq("status", "ended")
    .select("id");
  if (!claimed?.length) return { status: "skipped" };

  let entry: TranscriptTurn | null = null;
  if (result.messages.length > 0) {
    const { error } = await admin.from("messages").insert(
      result.messages.map((content) => ({ conversation_id: conversationId, speaker: side, content, turn })),
    );
    if (error) throw new Error(`Couldn't save messages: ${error.message}`);
    entry = { speaker: side, turn, messages: result.messages };
  }
  const { error: ledgerError } = await admin.from("ledgers").upsert({
    conversation_id: conversationId,
    owner: side,
    ...ledger,
    updated_at: new Date().toISOString(),
  });
  if (ledgerError) throw new Error(`Couldn't save ledger: ${ledgerError.message}`);

  const endReason = result.end ?? (turn >= TURN_CAP ? "turn_cap" : null);
  if (endReason) await endConversation(admin, conversationId, endReason);
  return { status: "turn", turn: entry, ended: Boolean(endReason), endReason };
}

async function endConversation(
  admin: SupabaseClient,
  conversationId: string,
  endReason: EndReason | "error",
) {
  await admin
    .from("conversations")
    .update({ status: "ended", end_reason: endReason, ended_at: new Date().toISOString() })
    .eq("id", conversationId);
}

// Runs a whole conversation in one go (for scripts). 20 turns take a few minutes.
export async function runConversation(
  admin: SupabaseClient,
  {
    userA,
    userB,
    onTurn,
  }: { userA: string; userB: string; onTurn?: (turn: TranscriptTurn) => void },
) {
  const conversationId = await createConversation(admin, userA, userB);
  let endReason: EndReason = "turn_cap";
  try {
    for (;;) {
      const step = await stepConversation(admin, conversationId);
      if (step.status !== "turn") break;
      if (step.turn) onTurn?.(step.turn);
      if (step.ended) {
        endReason = step.endReason ?? "turn_cap";
        break;
      }
    }
  } catch (error) {
    await endConversation(admin, conversationId, "error");
    throw error;
  }
  const [transcript, a, b] = await Promise.all([
    loadTranscript(admin, conversationId),
    loadLedger(admin, conversationId, "a"),
    loadLedger(admin, conversationId, "b"),
  ]);
  return { conversationId, endReason, transcript, ledgers: { a, b } };
}
