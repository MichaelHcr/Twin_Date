import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { requireUser } from "@/lib/auth";
import { decisionState, loadRevealedProfiles, type DecisionRow } from "@/lib/decisions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatComposer } from "./composer";
import { ChatLiveUpdates } from "./live-updates";
import { BackLink } from "@/components/back-link";

// Person-to-person chat with a connected match (both said yes).
export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
        <BackLink href="/connections">Your connections</BackLink>
        <Suspense fallback={<p className="mt-8 text-zinc-500">Loading…</p>}>
          <ChatLoader params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function ChatLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();

  // Row-level security returns nothing unless this user is part of the conversation.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, user_a, user_b")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) notFound();

  const { data: decisions } = await supabase
    .from("decisions")
    .select("user_id, decision")
    .eq("conversation_id", id);
  if (!decisionState((decisions ?? []) as DecisionRow[], user.id).connected) {
    return (
      <p className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        Chat opens once you both say yes.{" "}
        <Link href={`/matches/${id}`} className="font-medium underline">
          Back to the report
        </Link>
      </p>
    );
  }

  const otherId = conversation.user_a === user.id ? conversation.user_b : conversation.user_a;
  const [profiles, { data: messages, error }] = await Promise.all([
    loadRevealedProfiles(createAdminClient(), [otherId]),
    supabase
      .from("chat_messages")
      .select("id, sender_id, content")
      .eq("conversation_id", id)
      .order("created_at")
      .order("id"),
  ]);
  const other = profiles.get(otherId);
  const name = other?.name ?? "Your match";

  return (
    <div className="mt-2 flex flex-col">
      <ChatLiveUpdates conversationId={id} />
      <div className="flex items-center gap-3">
        <Avatar name={name} url={other?.photoUrls[0]} />
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">{name}</h1>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {[other?.age != null ? `${other.age}` : null, other?.city].filter(Boolean).join(" · ")}
        {" · "}
        <Link href={`/matches/${id}`} className="font-semibold text-black underline dark:text-zinc-50">
          See the twins&apos; report
        </Link>
      </p>
      {other?.isSeed && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Demo profile: {name} is a synthetic member and won&apos;t reply. Use two real accounts to try the chat.
        </p>
      )}

      {/* column-reverse keeps the newest messages in view at the bottom */}
      <div className="mt-6 flex max-h-[60vh] flex-col-reverse overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-red-600">{error.message}</p>}
          {(messages ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              You&apos;re connected. Say hi, or start with one of the report&apos;s questions to ask.
            </p>
          )}
          {(messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.sender_id === user.id
                  ? "self-end bg-black text-white dark:bg-white dark:text-black"
                  : "self-start bg-zinc-100 text-black dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {m.content}
            </div>
          ))}
        </div>
      </div>

      <ChatComposer conversationId={id} />
      <p className="mt-2 text-xs text-zinc-500">Written by you, not your twin. Only the two of you can see this chat.</p>
    </div>
  );
}
