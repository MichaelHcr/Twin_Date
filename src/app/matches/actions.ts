"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

// Hides a passed match from the user's own list (migration 0011). Nothing is
// deleted, and the other person never sees it. Returns an error message, or null.
export async function hideMatch(conversationId: string) {
  if (!z.uuid().safeParse(conversationId).success) return { error: "That match can't be hidden." };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("hidden_matches")
    .upsert({ user_id: user.id, conversation_id: conversationId }, { ignoreDuplicates: true });
  if (error) return { error: `Couldn't hide it: ${error.message}` };
  revalidatePath("/", "layout");
  return null;
}
