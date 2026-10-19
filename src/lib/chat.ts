import type { SupabaseClient } from "@supabase/supabase-js";

// Unread counts and latest-message previews for the user's chats (migration 0008).

export type ChatSummary = {
  unread: number;
  lastContent: string;
  lastAt: string;
  lastFromMe: boolean;
};

type Row = {
  conversation_id: string;
  unread: number;
  last_content: string;
  last_at: string;
  last_from_me: boolean;
};

// Keyed by conversation id. Pass the signed-in user's client: the function runs
// with their permissions. Returns an empty map if the migration isn't applied
// yet, so pages still load without unread badges.
export async function loadChatSummaries(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("chat_summaries");
  if (error) return new Map<string, ChatSummary>();
  return new Map<string, ChatSummary>(
    ((data ?? []) as Row[]).map((r) => [
      r.conversation_id,
      {
        unread: Number(r.unread),
        lastContent: r.last_content,
        lastAt: r.last_at,
        lastFromMe: r.last_from_me,
      },
    ]),
  );
}
