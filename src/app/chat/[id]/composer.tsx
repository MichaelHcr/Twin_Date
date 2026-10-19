"use client";

import { useRef, useState, useTransition } from "react";
import { sendChatMessage } from "./actions";

// The message bar at the bottom of the chat: a pill-shaped box that grows with
// the text, and a round send button. Enter sends; Shift+Enter adds a new line.
// Before the first message, the report's "questions to ask" show as starters.
export function ChatComposer({ conversationId, starters = [] }: { conversationId: string; starters?: string[] }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function send() {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendChatMessage(conversationId, content);
      if (result) {
        setError(result.error);
      } else {
        setText("");
        requestAnimationFrame(resize);
      }
    });
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {starters.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => {
                setText(s);
                requestAnimationFrame(() => {
                  resize();
                  box.current?.focus();
                });
              }}
              className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-left text-xs font-medium text-rose-800 hover:border-rose-400 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Message…"
          className="max-h-40 min-w-0 flex-1 resize-none rounded-3xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:bg-zinc-950"
        />
        <button
          onClick={send}
          disabled={pending || !text.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-md transition hover:brightness-110 disabled:from-zinc-300 disabled:to-zinc-300 disabled:shadow-none dark:disabled:from-zinc-700 dark:disabled:to-zinc-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {error && <p className="mt-2 px-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
