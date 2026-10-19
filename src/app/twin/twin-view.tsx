"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { refreshPages } from "@/app/actions";
import { BurstChat, type ChatMessage } from "@/components/burst-chat";
import type { Persona } from "@/lib/agents/persona-builder";

type Latest = { version: number; createdAt: string; persona: Persona } | null;

export function TwinView({ name, latest }: { name: string; latest: Latest }) {
  const router = useRouter();
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const started = useRef(false);

  async function build() {
    setBuilding(true);
    setBuildError(null);
    try {
      const res = await fetch("/api/persona", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      await refreshPages();
      router.refresh();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBuilding(false);
    }
  }

  // First visit after the interview: build the twin automatically.
  useEffect(() => {
    if (latest || started.current) return;
    started.current = true;
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!latest) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
        {buildError ? (
          <>
            <p className="text-red-600 dark:text-red-400">{buildError}</p>
            <button onClick={build} className="mt-3 text-sm font-medium underline">
              Try again
            </button>
          </>
        ) : (
          <>
            <p className="text-black dark:text-zinc-50">Building your twin from your interview…</p>
            <p className="mt-1 text-sm text-zinc-500">This takes about 30 seconds.</p>
          </>
        )}
      </div>
    );
  }

  const { persona } = latest;
  const s = persona.style;

  return (
    <>
      <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Interview summary</h2>
        <p className="mt-2 leading-7 text-zinc-700 dark:text-zinc-300">{persona.summary}</p>

        <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">Your twin will likely bring up</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {persona.highlights.map((h) => (
            <li key={h} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {h}
            </li>
          ))}
        </ul>

        <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">How your twin texts</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Trait label="Message length" value={s.message_length} />
          <Trait label="Tone" value={s.formality} />
          <Trait label="Emoji" value={s.emoji_use} />
          <Trait label="Asks questions" value={s.asks_questions} />
          <Trait label="Texts in bursts" value={s.texts_in_bursts ? "yes" : "no"} />
          <Trait label="Humor" value={s.humor} />
        </dl>

        {persona.unknowns.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-black dark:text-zinc-50">
              Your twin will ask you before answering about
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{persona.unknowns.join(" · ")}</p>
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/onboarding/profile" className="font-medium underline">
            Edit profile
          </Link>
          <button onClick={build} disabled={building} className="font-medium underline disabled:opacity-50">
            {building ? "Rebuilding…" : "Rebuild twin from latest profile"}
          </button>
          {buildError && <span className="text-red-600 dark:text-red-400">{buildError}</span>}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Talk to your twin</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Pretend you&apos;re a new match and say hi. Does it sound like you? This chat isn&apos;t saved.
        </p>
        <TwinChat key={latest.version} name={name} />
      </section>
    </>
  );
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-zinc-800 dark:text-zinc-200">{value}</dd>
    </>
  );
}

function TwinChat({ name }: { name: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(conversation: ChatMessage[]) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/twin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setMessages([
        ...conversation,
        ...(data.replies as string[]).map((content) => ({ role: "assistant" as const, content })),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  function onFinish(batch: string[]) {
    const next = [...messages, ...batch.map((content) => ({ role: "user" as const, content }))];
    setMessages(next);
    ask(next);
  }

  return (
    <BurstChat
      messages={messages}
      pending={pending}
      error={error}
      onFinish={onFinish}
      onRetry={messages.at(-1)?.role === "user" ? () => ask(messages) : undefined}
      placeholder={`Say hi to ${name}'s twin…`}
    />
  );
}
