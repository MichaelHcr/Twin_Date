"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Listens for chat messages sent to the user on any page and re-renders, so the
// unread badges in the header and lists update right away. Realtime only
// delivers rows the user may read (migration 0005 policies). An open chat page
// handles its own messages.
export function ChatNotifier({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const onChatPage = useRef(false);
  useEffect(() => {
    onChatPage.current = pathname.startsWith("/chat/");
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-notifier:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const senderId = (payload.new as { sender_id?: string }).sender_id;
        if (senderId !== userId && !onChatPage.current) router.refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return null;
}
