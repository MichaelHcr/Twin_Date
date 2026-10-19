"use client";

import { useEffect, useRef, useState } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// A chat window where the user can send several messages in a row (like texting
// in bursts). Messages collect as a draft; the other side only replies once the
// user presses "Finish". Enter adds a message, Cmd/Ctrl+Enter finishes.
export function BurstChat({
  messages,
  pending,
  error,
  onFinish,
  onRetry,
  placeholder = "Type a message…",
  footer,
}: {
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
  onFinish: (batch: string[]) => void;
  onRetry?: () => void;
  placeholder?: string;
  footer?: React.ReactNode;
}) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draft, pending]);

  function addToDraft() {
    const text = input.trim();
    if (!text) return;
    setDraft((d) => [...d, text].slice(0, 10));
    setInput("");
  }

  function finish() {
    const batch = [...draft, input.trim()].filter(Boolean);
    if (batch.length === 0 || pending) return;
    setDraft([]);
    setInput("");
    onFinish(batch);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) finish();
    else addToDraft();
  }

  const canFinish = !pending && (draft.length > 0 || input.trim().length > 0);

  return (
    <div className="mt-8 flex flex-col gap-4">
      <div className="flex min-h-80 flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.content}</Bubble>
        ))}
        {draft.map((text, i) => (
          <Bubble key={`draft-${i}`} role="user" draft>{text}</Bubble>
        ))}
        {draft.length > 0 && (
          <p className="self-end text-xs text-zinc-400">Not sent yet. Press Finish when you&apos;re done.</p>
        )}
        {pending && (
          <div className="self-start rounded-2xl bg-zinc-100 px-4 py-2 text-zinc-500 dark:bg-zinc-800">
            typing…
          </div>
        )}
        <div ref={bottom} />
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <span>{error}</span>
          {onRetry && (
            <button onClick={onRetry} disabled={pending} className="font-medium underline">
              Retry
            </button>
          )}
        </div>
      )}

      {footer ?? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              disabled={pending}
              maxLength={2000}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-black disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={addToDraft}
              disabled={pending || !input.trim() || draft.length >= 10}
              className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-black disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-50"
            >
              Send
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={!canFinish}
              className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
            >
              Finish
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            Send as many messages as you like, then press Finish (or Cmd/Ctrl+Enter) for a reply.
          </p>
        </div>
      )}
    </div>
  );
}

function Bubble({ role, draft, children }: { role: ChatMessage["role"]; draft?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 ${
        role === "user"
          ? `self-end bg-black text-white dark:bg-white dark:text-black ${draft ? "opacity-60" : ""}`
          : "self-start bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
      }`}
    >
      {children}
    </div>
  );
}
