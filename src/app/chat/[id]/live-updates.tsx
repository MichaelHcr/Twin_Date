"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Re-renders the chat when a new message arrives. Supabase Realtime pushes new
// rows (migration 0005 turns it on for chat_messages); a slow refresh is the
// fallback if Realtime isn't connected.
export function ChatLiveUpdates({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    const fallback = setInterval(() => router.refresh(), 15000);

    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
