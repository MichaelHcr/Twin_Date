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

type Side = "a" | "b";
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
      return "Red flag recorded. The conversation ends after this turn: send a short, kind goodbye now.";
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

// Runs a whole conversation between two users' twins in one go and stores it.
// 20 turns take a few minutes, so call it from a script or a background job,
// not from a normal request.
export async function runConversation(
  admin: SupabaseClient,
  {
    userA,
    userB,
    onTurn,
  }: { userA: string; userB: string; onTurn?: (turn: TranscriptTurn) => void },
) {
  if (userA === userB) throw new Error("A conversation needs two different users.");

  const [promptA, promptB, lockedA, lockedB] = await Promise.all([
    loadTwinPrompt(admin, userA, { alias: ALIASES.a }),
    loadTwinPrompt(admin, userB, { alias: ALIASES.b }),
    loadLockedAnswers(admin, userA),
    loadLockedAnswers(admin, userB),
  ]);
  if (!promptA || !promptB) {
    throw new Error("Both users need a completed profile and a persona card.");
  }
  const twins = {
    a: { system: promptA + conversationRules(ALIASES.b), locked: lockedA, ledger: emptyLedger() },
    b: { system: promptB + conversationRules(ALIASES.a), locked: lockedB, ledger: emptyLedger() },
  };

  const { data: conversation, error } = await admin
    .from("conversations")
    .insert({ user_a: userA, user_b: userB, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error || !conversation) throw new Error(`Couldn't create conversation: ${error?.message}`);
  const conversationId = conversation.id as string;

  const saveLedger = async (side: Side) => {
    const { error } = await admin.from("ledgers").upsert({
      conversation_id: conversationId,
      owner: side,
      ...twins[side].ledger,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Couldn't save ledger: ${error.message}`);
  };

  const transcript: TranscriptTurn[] = [];
  let endReason: EndReason = "turn_cap";
  try {
    await Promise.all([saveLedger("a"), saveLedger("b")]);

    for (let turn = 1; turn <= TURN_CAP; turn++) {
      const side: Side = turn % 2 === 1 ? "a" : "b";
      const twin = twins[side];
      const result = await runTwinConversationTurn({
        systemPrompt: twin.system,
        messages: historyFor(side, transcript, turn, twin.ledger),
        ledger: twin.ledger,
        turn,
        lockedAnswers: twin.locked,
      });

      if (result.messages.length > 0) {
        const { error: messagesError } = await admin.from("messages").insert(
          result.messages.map((content) => ({
            conversation_id: conversationId,
            speaker: side,
            content,
            turn,
          })),
        );
        if (messagesError) throw new Error(`Couldn't save messages: ${messagesError.message}`);
        const entry = { speaker: side, turn, messages: result.messages };
        transcript.push(entry);
        onTurn?.(entry);
      }
      await saveLedger(side);
      await admin.from("conversations").update({ turn_count: turn }).eq("id", conversationId);

      if (result.end) {
        endReason = result.end;
        break;
      }
    }

    await admin
      .from("conversations")
      .update({ status: "ended", end_reason: endReason, ended_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch (error) {
    await admin
      .from("conversations")
      .update({ status: "ended", end_reason: "error", ended_at: new Date().toISOString() })
      .eq("id", conversationId);
    throw error;
  }

  return {
    conversationId,
    endReason,
    transcript,
    ledgers: { a: twins.a.ledger, b: twins.b.ledger },
  };
}
