"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { refreshPages } from "@/app/actions";
import { BurstChat, type ChatMessage } from "@/components/burst-chat";

export function Chat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  // Sends a batch of messages, or with none, starts the interview / retries a failed reply.
  async function send(batch: string[] = []) {
    setPending(true);
    setError(null);
    if (batch.length > 0) {
      setMessages((m) => [...m, ...batch.map((content) => ({ role: "user" as const, content }))]);
    }
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: batch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      if (data.done) {
        setDone(true);
        await refreshPages();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  // Start the interview automatically on first visit.
  useEffect(() => {
    if (started.current || initialMessages.length > 0) return;
    started.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const awaitingReply = messages.at(-1)?.role === "user";

  return (
    <BurstChat
      messages={messages}
      pending={pending}
      error={error ?? (awaitingReply && !pending ? "The interviewer hasn't replied to your last message yet." : null)}
      onFinish={send}
      onRetry={awaitingReply ? () => send() : undefined}
      placeholder="Type your answer…"
      footer={
        done ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-black dark:text-zinc-50">Interview complete!</p>
            <Link
              href="/twin"
              className="mt-3 inline-block rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              See your summary and meet your twin
            </Link>
          </div>
        ) : undefined
      }
    />
  );
}
