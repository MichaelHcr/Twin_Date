"use client";

import { useRef, useState, useTransition } from "react";
import { sendChatMessage } from "./actions";
import { useChatRoom } from "./room";

// The message bar at the bottom of the chat: a pill-shaped box that grows with
// the text, and a round send button. Enter sends; Shift+Enter adds a new line.
// While the chat is young, the report's "questions to ask" show as starters.
// When it has gone quiet for a couple of days, a topic is offered instead:
// something the twins talked about that you haven't, with a line to send.
export function ChatComposer({
  conversationId,
  starters = [],
  quiet = null,
}: {
  conversationId: string;
  starters?: string[];
  quiet?: { days: number; topics: { intro: string | null; line: string }[] } | null;
}) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const { notifyTyping } = useChatRoom();

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

  function fill(value: string) {
    setText(value);
    requestAnimationFrame(() => {
      resize();
      box.current?.focus();
    });
  }

  const showQuiet = quiet && quiet.topics.length > 0 && !dismissed;
  const current = showQuiet ? quiet.topics[topic % quiet.topics.length] : null;

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {current && (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">It&apos;s been {quiet!.days} days. Something to talk about?</p>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 rounded-full px-1.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              ×
            </button>
          </div>
          {current.intro && <p className="mt-0.5">{current.intro}</p>}
          <p className="mt-1 font-medium">“{current.line}”</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                fill(current.line);
                setDismissed(true);
              }}
              className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black"
            >
              Ask this
            </button>
            {quiet!.topics.length > 1 && (
              <button
                onClick={() => setTopic((t) => t + 1)}
                className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                Another one
              </button>
            )}
          </div>
        </div>
      )}
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
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
            if (e.target.value.trim()) notifyTyping();
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition hover:bg-violet-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {error && <p className="mt-2 px-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
