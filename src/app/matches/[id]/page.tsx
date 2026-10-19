import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { END_REASON_LABELS, scoreColor } from "@/lib/matches";

// One match: the Judge's report and the anonymized transcript.
export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <Link href="/matches" className="text-sm text-zinc-500 hover:underline">
          ← Your matches
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Match report
        </h1>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <MatchLoader params={params} />
        </Suspense>
      </div>
    </main>
  );
}

type Evidence = { speaker: "a" | "b"; quote: string; why: string };

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
      .select("score, summary, evidence_json, red_flags, questions_to_ask")
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
  const who = (side: string) => (side === mySide ? "Your twin" : "Their twin");

  return (
    <div className="mt-6 flex flex-col gap-6">
      {report ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold ${scoreColor(report.score)}`}
            >
              {report.score}
            </span>
            <p className="text-sm text-zinc-500">
              {conversation.end_reason ? END_REASON_LABELS[conversation.end_reason] : "In progress"} ·{" "}
              {conversation.turn_count} turns · you are Member {mySide.toUpperCase()}
            </p>
          </div>
          <p className="mt-4 leading-7 text-black dark:text-zinc-50">{report.summary}</p>

          {(report.red_flags as string[]).length > 0 && (
            <>
              <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">Red flags</h2>
              <ul className="mt-2 list-disc pl-5 text-red-700 dark:text-red-400">
                {(report.red_flags as string[]).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </>
          )}

          <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">What stood out</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {(report.evidence_json as Evidence[]).map((e) => (
              <li key={e.quote} className="text-sm">
                <blockquote className="border-l-2 border-zinc-300 pl-3 text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                  “{e.quote}” <span className="text-zinc-500">({who(e.speaker)})</span>
                </blockquote>
                <p className="mt-1 pl-3 text-zinc-500">{e.why}</p>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 font-semibold text-black dark:text-zinc-50">Ask in person</h2>
          <ul className="mt-2 list-disc pl-5 text-zinc-800 dark:text-zinc-200">
            {(report.questions_to_ask as string[]).map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          {conversation.status === "ended" ? "The report is being written." : "Your twin is still chatting."}
        </p>
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
    </div>
  );
}
