import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { View } from "@/lib/agents/judge";
import { END_REASON_LABELS, fillMatch, scoreColor } from "@/lib/matches";
import { DecisionBar, DecisionStatus, loadRevealed, loadState } from "./decision-panel";
import { LiveRunner } from "./live-runner";
import { BackLink } from "@/components/back-link";

// One match: the Judge's report and the anonymized transcript.
export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <main className="flex flex-1 justify-center px-4 py-12 font-sans">
      <div className="flex w-full max-w-xl flex-col">
        <BackLink href="/matches">Your matches</BackLink>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Match report
        </h1>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <MatchLoader params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function MatchLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  // Row-level security returns nothing unless this user is part of the conversation.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, user_a, user_b, status, end_reason, turn_count")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const [{ data: report }, { data: messages }] = await Promise.all([
    supabase
      .from("reports")
      .select("score, summary, red_flags, questions_to_ask, views")
      .eq("conversation_id", id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, speaker, content, turn")
      .eq("conversation_id", id)
      .order("turn")
      .order("id"),
  ]);

  const mySide = user.id === conversation.user_a ? "a" : "b";
  const view = (report?.views as Record<"a" | "b", View> | null)?.[mySide] ?? null;
  // After a mutual yes, the report uses their first name instead of "this match".
  let name: string | null = null;
  if (view && (await loadState(supabase, conversation.id)).connected) {
    const otherId = mySide === "a" ? conversation.user_b : conversation.user_a;
    name = (await loadRevealed(otherId))?.name.split(" ")[0] ?? null;
  }
  const fill = (text: string) => fillMatch(text, name);

  const unfinished =
    conversation.status !== "ended" || (!report && conversation.end_reason !== "error");

  return (
    <div className="mt-6 flex flex-col gap-6">
      {unfinished && <LiveRunner conversationId={conversation.id} />}
      {report && <DecisionStatus supabase={supabase} conversation={conversation} userId={user.id} />}
      {report ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${scoreColor(report.score)}`}
            >
              {report.score}
            </span>
            <div>
              {view && <p className="font-medium text-black dark:text-zinc-50">{fill(view.headline)}</p>}
              <p className="text-sm text-zinc-500">
                {conversation.end_reason ? END_REASON_LABELS[conversation.end_reason] : "In progress"} ·{" "}
                {conversation.turn_count} turns
              </p>
            </div>
          </div>

          {view ? (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <ReportList title="Why it could work" items={view.pros.map(fill)} tone="pro" />
                <ReportList title="What to watch" items={view.cons.map(fill)} tone="con" empty="Nothing major." />
              </div>

              <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">Red flags</h2>
              {view.red_flags.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-400">
                  {view.red_flags.map((f) => (
                    <li key={f}>{fill(f)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">No red flags triggered.</p>
              )}

              <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">If you meet</h2>
              <ul className="mt-2 flex flex-col gap-2 text-zinc-800 dark:text-zinc-200">
                {view.next_steps.map((step) => (
                  <li key={step} className="flex gap-2">
                    <span className="mt-0.5 text-zinc-400" aria-hidden>
                      ☐
                    </span>
                    {fill(step)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            // Reports written before per-person views (migration 0010).
            <>
              <p className="mt-4 leading-7 text-black dark:text-zinc-50">{report.summary}</p>
              <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">Red flags</h2>
              {(report.red_flags as string[]).length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-400">
                  {(report.red_flags as string[]).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-zinc-600 dark:text-zinc-400">No red flags triggered.</p>
              )}
              <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">Ask in person</h2>
              <ul className="mt-2 list-disc pl-5 text-zinc-800 dark:text-zinc-200">
                {(report.questions_to_ask as string[]).map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : (
        conversation.end_reason === "error" && (
          <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
            This chat stopped because of an error, so there&apos;s no report.
          </p>
        )
      )}

      <section>
        <h2 className="font-semibold text-black dark:text-zinc-50">The chat</h2>
        <div className="mt-3 flex flex-col gap-2">
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.speaker === mySide
                  ? "self-end bg-black text-white dark:bg-white dark:text-black"
                  : "self-start bg-white text-black ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Right: your twin. Left: their twin. Names stay hidden until you both say yes.
        </p>
      </section>

      {report && <DecisionBar supabase={supabase} conversation={conversation} />}
    </div>
  );
}

function ReportList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: string[];
  tone: "pro" | "con";
  empty?: string;
}) {
  const mark = tone === "pro" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <h2 className="font-semibold text-black dark:text-zinc-50">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-zinc-800 dark:text-zinc-200">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className={mark} aria-hidden>
                {tone === "pro" ? "+" : "–"}
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">{empty}</p>
      )}
    </div>
  );
}
