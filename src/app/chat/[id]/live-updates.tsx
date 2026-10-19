"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { markChatRead } from "./actions";

// Keeps an open chat current and read: marks it read on open and whenever a new
// message arrives, which also re-renders the page. Supabase Realtime pushes new
// rows (migration 0005 turns it on for chat_messages); a slow refresh is the
// fallback if Realtime isn't connected.
export function ChatLiveUpdates({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  useEffect(() => {
    const update = () => {
      markChatRead(conversationId).then((ok) => {
        if (!ok) router.refresh();
      });
    };
    update();
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
        update,
      )
      .subscribe();
    const fallback = setInterval(update, 15000);

    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [conversationId, router]);

  return null;
}
