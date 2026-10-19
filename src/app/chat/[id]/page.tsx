import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, loadRevealedProfiles } from "@/lib/decisions";
import { signPhotoUrls } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatComposer } from "./composer";
import { ChatLiveUpdates } from "./live-updates";
import { ChatMessages } from "./messages";
import { BackLink } from "@/components/back-link";

// Person-to-person chat with a connected match (both said yes).
export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-6 font-sans sm:py-10 dark:bg-black">
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

  if (!(await loadDecisionStates(supabase, id)).get(id)?.connected) {
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
  const [profiles, { data: messages, error }, { data: me }, { data: report }] = await Promise.all([
    loadRevealedProfiles(createAdminClient(), [otherId]),
    supabase
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .order("id"),
    supabase.from("profiles").select("display_name, photos").eq("user_id", user.id).single(),
    supabase.from("reports").select("questions_to_ask").eq("conversation_id", id).maybeSingle(),
  ]);
  const other = profiles.get(otherId);
  const name = other?.name ?? "Your match";
  const [myPhoto = null] = await signPhotoUrls(supabase, ((me?.photos ?? []) as string[]).slice(0, 1));
  const empty = (messages ?? []).length === 0;
  const starters = empty ? ((report?.questions_to_ask ?? []) as string[]).slice(0, 4) : [];

  return (
    <div className="mt-4 flex h-[calc(100dvh-11rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <ChatLiveUpdates conversationId={id} />

      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Avatar name={name} url={other?.photoUrls[0]} className="h-11 w-11 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight text-black dark:text-zinc-50">{name}</h1>
          <p className="truncate text-xs text-zinc-500">
            {[other?.age != null ? `${other.age}` : null, other?.city, other?.isSeed ? "Demo profile" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link
          href={`/matches/${id}`}
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Twins&apos; report
        </Link>
      </header>

      {other?.isSeed && (
        <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {name} is a synthetic demo member and won&apos;t reply. Use two real accounts to try the chat.
        </p>
      )}

      {/* column-reverse keeps the newest messages in view at the bottom */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-4 py-4">
        <div className="flex flex-col">
          {error && <p className="text-sm text-red-600">{error.message}</p>}
          {empty ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="flex items-center">
                <Avatar name={me?.display_name ?? "You"} url={myPhoto} className="h-20 w-20 text-2xl ring-4 ring-white dark:ring-zinc-950" />
                <Avatar name={name} url={other?.photoUrls[0]} className="-ml-5 h-20 w-20 text-2xl ring-4 ring-white dark:ring-zinc-950" />
              </div>
              <p className="mt-4 text-xl font-semibold text-black dark:text-zinc-50">You and {name} matched</p>
              <p className="mt-1 max-w-xs text-sm text-zinc-500">
                Your twins already covered the basics. Say hi, or pick a question from their report below.
              </p>
            </div>
          ) : (
            <ChatMessages
              otherName={name}
              otherPhotoUrl={other?.photoUrls[0] ?? null}
              messages={(messages ?? []).map((m) => ({
                id: m.id,
                mine: m.sender_id === user.id,
                content: m.content,
                createdAt: m.created_at,
              }))}
            />
          )}
        </div>
      </div>

      <ChatComposer conversationId={id} starters={starters} />
      <p className="bg-white px-4 pb-2 text-center text-[11px] text-zinc-400 dark:bg-zinc-950">
        Written by you, not your twin. Only the two of you can see this chat.
      </p>
    </div>
  );
}
