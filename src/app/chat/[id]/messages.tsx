"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { formatClock, formatDay, useIsClient } from "@/components/local-time";
import { toggleHeart } from "./actions";
import { useChatRoom } from "./room";

export type ChatMessage = {
  id: number;
  mine: boolean;
  content: string;
  createdAt: string;
  // Who has hearted it.
  heartedByMe: boolean;
  heartedByThem: boolean;
};

// Messages in a row from the same person within this gap, on the same day, form
// one run: one avatar and one timestamp, under the run's last message.
const GROUP_GAP_MS = 5 * 60 * 1000;

// One to three emoji and nothing else: shown big, without a bubble.
const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*\s*){1,3}$/u;

function sameRun(a: ChatMessage | undefined, b: ChatMessage | undefined) {
  if (!a || !b || a.mine !== b.mine) return false;
  const ta = new Date(a.createdAt);
  const tb = new Date(b.createdAt);
  return Math.abs(tb.getTime() - ta.getTime()) <= GROUP_GAP_MS && ta.toDateString() === tb.toDateString();
}

// Bubble corners tighten where a run continues, like Instagram.
function corners(mine: boolean, joinsPrev: boolean, joinsNext: boolean) {
  if (mine) return `rounded-3xl ${joinsPrev ? "rounded-tr-md" : ""} ${joinsNext ? "rounded-br-md" : ""}`;
  return `rounded-3xl ${joinsPrev ? "rounded-tl-md" : ""} ${joinsNext ? "rounded-bl-md" : ""}`;
}

function Heart({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

// The chat transcript: day separators, send times in the viewer's time zone,
// the other person's avatar once per run, hearts (double-click a message, or
// use the heart beside it), "Seen" under your last message, and a typing
// indicator.
export function ChatMessages({
  conversationId,
  messages,
  otherName,
  otherPhotoUrl,
  seenAt,
}: {
  conversationId: string;
  messages: ChatMessage[];
  otherName: string;
  otherPhotoUrl: string | null;
  seenAt: string | null;
}) {
  const isClient = useIsClient();
  const { otherTyping, notifyChanged } = useChatRoom();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const last = messages.at(-1);
  const seen = Boolean(last?.mine && seenAt && new Date(seenAt) >= new Date(last.createdAt));

  function heart(id: number) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await toggleHeart(conversationId, id);
      if (result) setError(result.error);
      else notifyChanged();
    });
  }

  return (
    <div className="flex flex-col">
      {messages.map((m, i) => {
        const at = new Date(m.createdAt);
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== at.toDateString();
        const joinsPrev = sameRun(prev, m);
        const joinsNext = sameRun(m, next);
        const emojiOnly = EMOJI_ONLY.test(m.content.trim());
        const hearted = m.heartedByMe || m.heartedByThem;

        const bubble = (
          <div className="relative max-w-[75%]">
            <div
              onDoubleClick={() => heart(m.id)}
              title="Double-click to heart"
              className={
                emojiOnly
                  ? "cursor-default select-none px-1 text-4xl leading-tight"
                  : `cursor-default whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${corners(m.mine, joinsPrev, joinsNext)} ${
                      m.mine
                        ? "bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-sm"
                        : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
                    }`
              }
            >
              {emojiOnly ? m.content.trim() : m.content}
            </div>
            {hearted && (
              <span
                className={`absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-rose-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${
                  m.mine ? "left-2" : "right-2"
                }`}
              >
                <Heart className="h-3 w-3" />
                {m.heartedByMe && m.heartedByThem && <span className="text-[10px] font-semibold">2</span>}
              </span>
            )}
          </div>
        );

        const heartButton = (
          <button
            onClick={() => heart(m.id)}
            aria-label={m.heartedByMe ? "Remove your heart" : "Heart this message"}
            className={`shrink-0 self-center rounded-full p-1.5 transition ${
              m.heartedByMe
                ? "text-rose-500"
                : "text-zinc-300 opacity-0 hover:text-rose-500 group-hover:opacity-100 focus-visible:opacity-100 dark:text-zinc-600"
            }`}
          >
            <Heart className="h-4 w-4" />
          </button>
        );

        return (
          <div key={m.id} className={`flex flex-col ${joinsPrev ? "mt-0.5" : "mt-3"} ${hearted ? "mb-3" : ""}`}>
            {isClient && newDay && (
              <p className="mb-2 mt-2 self-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {formatDay(at)}
              </p>
            )}
            {m.mine ? (
              <div className="group flex items-center justify-end gap-1">
                {heartButton}
                {bubble}
              </div>
            ) : (
              <div className="group flex items-end gap-2">
                {/* The avatar slot is always there, so a run's bubbles line up. */}
                <div className="w-7 shrink-0">
                  {!joinsNext && <Avatar name={otherName} url={otherPhotoUrl} className="h-7 w-7 text-[10px]" />}
                </div>
                {bubble}
                {heartButton}
              </div>
            )}
            {isClient && !joinsNext && (
              <time
                dateTime={m.createdAt}
                title={at.toLocaleString()}
                className={`mt-1 text-[11px] text-zinc-400 ${m.mine ? "self-end pr-9" : "ml-9 self-start"}`}
              >
                {m === last && seen ? `Seen · ${formatClock(at)}` : formatClock(at)}
              </time>
            )}
          </div>
        );
      })}

      {otherTyping && (
        <div className="mt-3 flex items-end gap-2" aria-live="polite">
          <Avatar name={otherName} url={otherPhotoUrl} className="h-7 w-7 text-[10px]" />
          <div className="flex items-center gap-1 rounded-3xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800">
            <span className="sr-only">{otherName} is typing</span>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="h-2 w-2 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
