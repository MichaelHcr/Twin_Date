"use client";

import { formatClock, formatDay, useIsClient } from "@/components/local-time";

export type ChatMessage = { id: number; mine: boolean; content: string; createdAt: string };

// Messages in a row from the same person within this gap share one timestamp.
const GROUP_GAP_MS = 5 * 60 * 1000;

// The chat transcript with day separators and send times, in the viewer's time zone.
export function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  const isClient = useIsClient();

  return (
    <div className="flex flex-col gap-1">
      {messages.map((m, i) => {
        const at = new Date(m.createdAt);
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== at.toDateString();
        const lastInGroup =
          !next || next.mine !== m.mine || new Date(next.createdAt).getTime() - at.getTime() > GROUP_GAP_MS;

        return (
          <div key={m.id} className="flex flex-col">
            {isClient && newDay && (
              <p className="my-3 self-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                {formatDay(at)}
              </p>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.mine
                  ? "self-end bg-black text-white dark:bg-white dark:text-black"
                  : "self-start bg-zinc-100 text-black dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {m.content}
            </div>
            {isClient && lastInGroup && (
              <time
                dateTime={m.createdAt}
                title={at.toLocaleString()}
                className={`mb-2 mt-1 text-xs text-zinc-500 ${m.mine ? "self-end" : "self-start"}`}
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
