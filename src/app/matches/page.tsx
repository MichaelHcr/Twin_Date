import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { END_REASON_LABELS, scoreColor, single } from "@/lib/matches";

// The shortlist: every twin conversation the user is part of, best score first.
export default function MatchesPage() {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Home
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Your matches
        </h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          First chats your twin had, ranked by how promising they look.
        </p>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <MatchesLoader />
        </Suspense>
      </div>
    </main>
  );
}

type Row = {
  id: string;
  status: string;
  end_reason: string | null;
  turn_count: number;
  created_at: string;
  reports: { score: number; summary: string } | { score: number; summary: string }[] | null;
};

async function MatchesLoader() {
  const { supabase } = await requireUser();
  // Row-level security only returns conversations this user is part of.
  const { data, error } = await supabase
    .from("conversations")
    .select("id, status, end_reason, turn_count, created_at, reports(score, summary)")
    .order("created_at", { ascending: false });
  if (error) return <p className="mt-8 text-red-600">{error.message}</p>;

  const rows = ((data ?? []) as Row[])
    .map((c) => ({ ...c, report: single(c.reports) }))
    .sort((x, y) => (y.report?.score ?? -1) - (x.report?.score ?? -1));

  if (rows.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        No chats yet. Your twin will start meeting people soon.
      </div>
    );
  }

  return (
    <ul className="mt-8 flex flex-col gap-3">
      {rows.map((c, i) => (
        <li key={c.id}>
          <Link
            href={`/matches/${c.id}`}
            className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-4 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            {c.report ? (
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${scoreColor(c.report.score)}`}
              >
                {c.report.score}
              </span>
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-900">
                …
              </span>
            )}
            <div className="min-w-0">
              <p className="font-medium text-black dark:text-zinc-50">Match #{i + 1}</p>
              <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                {c.report?.summary ??
                  (c.status === "ended" ? "Report coming soon." : "Your twin is chatting now.")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {c.end_reason ? END_REASON_LABELS[c.end_reason] : "In progress"} · {c.turn_count} turns
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
