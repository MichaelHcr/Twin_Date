"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const MessageSchema = z.object({
  conversationId: z.uuid(),
  content: z.string().trim().min(1, "Write a message first.").max(2000, "Keep it under 2,000 characters."),
});

// Sends a chat message to a connected match. Row-level security (migration 0005)
// refuses the insert unless both people want to meet. Returns an error message,
// or null on success.
export async function sendChatMessage(conversationId: string, content: string) {
  const parsed = MessageSchema.safeParse({ conversationId, content });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: user.id,
    content: parsed.data.content,
  });
  if (error) {
    return {
      error:
        error.code === "42501"
          ? "You can only message people you're connected with."
          : `Couldn't send: ${error.message}`,
    };
  }

  revalidatePath("/", "layout");
  return null;
}

// Marks the chat read up to now (migration 0008) and refreshes the pages, so
// unread badges clear. Returns false if it couldn't, for example before the
// migration is applied; the caller then refreshes on its own.
export async function markChatRead(conversationId: string) {
  if (!z.uuid().safeParse(conversationId).success) return false;
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_chat_read", { conv: conversationId });
  if (error) return false;
  revalidatePath("/", "layout");
  return true;
}
