"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { markChatRead } from "./actions";

// One realtime channel per open chat:
// - new messages (Postgres changes; Realtime applies chat_messages' policies),
// - "typing" and "changed" signals between the two people (broadcast). They
//   carry no content: "changed" just tells the other page to refresh after a
//   heart or a read, so "Seen" and hearts appear live.
// Opening the chat, or a new message arriving while it's open, marks it read.

type Room = {
  otherTyping: boolean;
  notifyTyping: () => void;
  notifyChanged: () => void;
};

const RoomContext = createContext<Room>({
  otherTyping: false,
  notifyTyping: () => {},
  notifyChanged: () => {},
});
export const useChatRoom = () => useContext(RoomContext);

const TYPING_SHOWS_MS = 4000;
const TYPING_SENDS_EVERY_MS = 2000;

export function ChatRoom({
  conversationId,
  userId,
  children,
}: {
  conversationId: string;
  userId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [otherTyping, setOtherTyping] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);

  const send = useCallback((event: "typing" | "changed") => {
    channel.current?.send({ type: "broadcast", event, payload: {} });
  }, []);

  useEffect(() => {
    const read = (tell: boolean) => {
      markChatRead(conversationId).then((ok) => {
        if (!ok) router.refresh();
        else if (tell) send("changed");
      });
    };

    const supabase = createClient();
    const ch = supabase
      .channel(`chat-room:${conversationId}`, { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if ((payload.new as { sender_id?: string }).sender_id !== userId) setOtherTyping(false);
          read(true);
        },
      )
      .on("broadcast", { event: "typing" }, () => {
        setOtherTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOWS_MS);
      })
      .on("broadcast", { event: "changed" }, () => router.refresh())
      .subscribe((status) => {
        // Tell them we've read it once we can, so their "Seen" updates.
        if (status === "SUBSCRIBED") read(true);
      });
    channel.current = ch;
    // Fallback in case Realtime isn't connected.
    const fallback = setInterval(() => read(false), 15000);

    return () => {
      clearInterval(fallback);
      clearTimeout(typingTimer.current);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [conversationId, userId, router, send]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < TYPING_SENDS_EVERY_MS) return;
    lastTypingSent.current = now;
    send("typing");
  }, [send]);

  const notifyChanged = useCallback(() => send("changed"), [send]);

  return (
    <RoomContext.Provider value={{ otherTyping, notifyTyping, notifyChanged }}>{children}</RoomContext.Provider>
  );
}
