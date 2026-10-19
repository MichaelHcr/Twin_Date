// Shared labels for the matches pages.

export const END_REASON_LABELS: Record<string, string> = {
  turn_cap: "Chat ran its full length",
  red_flag: "Ended on a dealbreaker",
  guardrail: "Stopped by a safety check",
  all_topics_covered: "Covered all the big topics",
  not_a_fit: "A twin decided it wasn't a fit",
  human_timeout: "Waited too long for an answer",
  error: "Stopped by an error",
};

export function scoreColor(score: number) {
  if (score >= 76) return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300";
  if (score >= 51) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

// A one-to-one embed comes back as an object, but older PostgREST versions return an array.
export function single<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
