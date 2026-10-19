"use client";

import { Avatar } from "@/components/avatar";
import { formatClock, formatDay, useIsClient } from "@/components/local-time";

export type ChatMessage = { id: number; mine: boolean; content: string; createdAt: string };

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

// The chat transcript with day separators and send times, in the viewer's time
// zone. The other person's avatar sits beside the last message of each run.
export function ChatMessages({
  messages,
  otherName,
  otherPhotoUrl,
}: {
  messages: ChatMessage[];
  otherName: string;
  otherPhotoUrl: string | null;
}) {
  const isClient = useIsClient();

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

        const bubble = emojiOnly ? (
          <div className="px-1 text-4xl leading-tight">{m.content.trim()}</div>
        ) : (
          <div
            className={`max-w-[75%] whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${corners(m.mine, joinsPrev, joinsNext)} ${
              m.mine
                ? "bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-sm"
                : "bg-zinc-100 text-black dark:bg-zinc-800 dark:text-zinc-50"
            }`}
          >
            {m.content}
          </div>
        );

        return (
          <div key={m.id} className={`flex flex-col ${joinsPrev ? "mt-0.5" : "mt-3"}`}>
            {isClient && newDay && (
              <p className="mb-2 mt-2 self-center text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {formatDay(at)}
              </p>
            )}
            {m.mine ? (
              <div className="flex justify-end">{bubble}</div>
            ) : (
              <div className="flex items-end gap-2">
                {/* The avatar slot is always there, so a run's bubbles line up. */}
                <div className="w-7 shrink-0">
                  {!joinsNext && <Avatar name={otherName} url={otherPhotoUrl} className="h-7 w-7 text-[10px]" />}
                </div>
                {bubble}
              </div>
            )}
            {isClient && !joinsNext && (
              <time
                dateTime={m.createdAt}
                title={at.toLocaleString()}
                className={`mt-1 text-[11px] text-zinc-400 ${m.mine ? "self-end pr-1" : "ml-9 self-start"}`}
              >
                {formatClock(at)}
              </time>
            )}
          </div>
        );
      })}
    </div>
  );
}
