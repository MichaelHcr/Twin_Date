"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { CHAT_PHOTO_BUCKET } from "@/lib/chat";

const MessageSchema = z.object({
  conversationId: z.uuid(),
  content: z.string().trim().max(2000, "Keep it under 2,000 characters."),
  imagePath: z.string().nullable(),
});

// Sends a chat message to a connected match: text, a photo the browser just
// uploaded to this chat's folder (migration 0015), or both. Row-level security
// refuses it unless both people want to meet. Returns an error message, or null.
export async function sendChatMessage(conversationId: string, content: string, imagePath: string | null = null) {
  const parsed = MessageSchema.safeParse({ conversationId, content, imagePath });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.content && !parsed.data.imagePath) return { error: "Write a message first." };
  const { supabase, user } = await requireUser();

  if (parsed.data.imagePath) {
    const match = new RegExp(`^${conversationId}/([0-9a-f-]{36}\\.(?:jpg|png|webp|gif))$`).exec(parsed.data.imagePath);
    if (!match) return { error: "That photo isn't in this chat." };
    // Make sure the upload really finished before sending a message that points at it.
    const { data: files } = await supabase.storage.from(CHAT_PHOTO_BUCKET).list(conversationId, { search: match[1] });
    if (!files?.some((f) => f.name === match[1])) return { error: "The photo didn't finish uploading. Try again." };
  }

  const { error } = await supabase.from("chat_messages").insert({
    conversation_id: parsed.data.conversationId,
    sender_id: user.id,
    content: parsed.data.content,
    image_path: parsed.data.imagePath,
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

// Adds or removes the user's heart on a message (migration 0011). Row-level
// security only allows it in a chat they're connected in.
export async function toggleHeart(conversationId: string, messageId: number) {
  const parsed = z.object({ conversationId: z.uuid(), messageId: z.number().int().positive() }).safeParse({
    conversationId,
    messageId,
  });
  if (!parsed.success) return { error: "That message can't be hearted." };
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("chat_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("chat_reactions").delete().eq("message_id", messageId).eq("user_id", user.id)
    : await supabase
        .from("chat_reactions")
        .insert({ message_id: messageId, user_id: user.id, conversation_id: conversationId });
  if (error) return { error: `Couldn't save your heart: ${error.message}` };

  revalidatePath("/", "layout");
  return null;
}
