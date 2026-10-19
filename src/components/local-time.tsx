"use client";

import { useSyncExternalStore } from "react";

// Times are shown in the viewer's own time zone, which only the browser knows,
// so these render nothing on the server and fill in right after hydration.
const subscribe = () => () => {};
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "Today", "Yesterday", "Monday", or "Oct 12" / "Oct 12, 2025".
export function formatDay(date: Date, now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  const daysAgo = (now.getTime() - date.getTime()) / 86_400_000;
  if (daysAgo < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// A short time for lists: "3:42 PM" today, otherwise the day.
export function ShortTime({ iso, className }: { iso: string; className?: string }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  const date = new Date(iso);
  return (
    <time dateTime={iso} title={date.toLocaleString()} className={className}>
      {sameDay(date, new Date()) ? formatClock(date) : formatDay(date)}
    </time>
  );
}

// A day for a sentence: "today", "yesterday", "Monday" or "Oct 12".
export function DayText({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  const day = formatDay(new Date(iso));
  return (
    <time dateTime={iso}>
      {prefix}
      {day === "Today" || day === "Yesterday" ? day.toLowerCase() : day}
    </time>
  );
}
