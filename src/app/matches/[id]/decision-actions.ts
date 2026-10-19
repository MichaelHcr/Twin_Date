"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  DECISIONS,
  isConnected,
  SEED_YES_SCORE,
  wantsToMeet,
  type Decision,
  type DecisionRow,
} from "@/lib/decisions";
import { single } from "@/lib/matches";
import { createAdminClient } from "@/lib/supabase/admin";

type Conversation = {
  user_a: string;
  user_b: string;
  status: string;
  end_reason: string | null;
  reports: { score: number } | { score: number }[] | null;
  decisions: DecisionRow[] | null;
};

// Saves the signed-in user's Yes, Pass or connection request on a match report.
// Returns an error message, or null on success.
export async function decide(conversationId: string, decision: Decision) {
  const parsed = z
    .object({ conversationId: z.uuid(), decision: z.enum(DECISIONS) })
    .safeParse({ conversationId, decision });
  if (!parsed.success) return { error: "That isn't a valid choice." };
  const { supabase, user } = await requireUser();

  // Row-level security returns the conversation only to its two participants.
  const { data } = await supabase
    .from("conversations")
    .select("user_a, user_b, status, end_reason, reports(score), decisions(user_id, decision)")
    .eq("id", conversationId)
    .maybeSingle();
  const conversation = data as Conversation | null;
  if (!conversation) return { error: "Match not found." };
  const report = single(conversation.reports);
  if (conversation.status !== "ended" || !report) {
    return { error: "Wait for the report before deciding." };
  }

  const rows = conversation.decisions ?? [];
  const mine = rows.find((r) => r.user_id === user.id)?.decision;
  const theirs = rows.find((r) => r.user_id !== user.id)?.decision;
  if (isConnected(mine, theirs)) return { error: "You're already connected, so this can't change." };

  const { error } = await supabase
    .from("decisions")
    .upsert({ conversation_id: conversationId, user_id: user.id, decision: parsed.data.decision });
  if (error) return { error: `Couldn't save your choice: ${error.message}` };

  // Nobody will ever answer for a seed member, so when a real user wants to meet
  // one, record the seed's answer from the Judge's score. That lets the demo reach
  // a match. Real members always decide for themselves.
  if (wantsToMeet(parsed.data.decision) && !theirs) {
    const otherId = conversation.user_a === user.id ? conversation.user_b : conversation.user_a;
    const admin = createAdminClient();
    const { data: other } = await admin
      .from("profiles")
      .select("is_seed")
      .eq("user_id", otherId)
      .single();
    if (other?.is_seed) {
      const seedSaysYes = report.score >= SEED_YES_SCORE && conversation.end_reason !== "red_flag";
      await admin.from("decisions").insert({
        conversation_id: conversationId,
        user_id: otherId,
        decision: seedSaysYes ? "yes" : "pass",
      });
    }
  }

  revalidatePath("/", "layout");
  return null;
}
