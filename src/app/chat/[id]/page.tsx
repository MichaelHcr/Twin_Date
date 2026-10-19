import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { DayText } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, loadRevealedProfiles } from "@/lib/decisions";
import { signPhotoUrls } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatComposer } from "./composer";
import { ChatMessages } from "./messages";
import { ChatRoom } from "./room";

// Person-to-person chat with a connected match (both said yes).
export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-4 py-6 font-sans sm:py-10 dark:bg-black">
      <div className="flex w-full max-w-xl flex-col">
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
  const admin = createAdminClient();
  const [profiles, { data: messages, error }, { data: me }, { data: report }, { data: hearts }, { data: seenAt }, { data: decided }] =
    await Promise.all([
    loadRevealedProfiles(admin, [otherId]),
    supabase
      .from("chat_messages")
      .select("id, sender_id, content, created_at")
      .eq("conversation_id", id)
      .order("created_at")
      .order("id"),
    supabase.from("profiles").select("display_name, photos").eq("user_id", user.id).single(),
    supabase.from("reports").select("summary, questions_to_ask").eq("conversation_id", id).maybeSingle(),
    // Hearts and "Seen" need migration 0009; without it these come back empty.
    supabase.from("chat_reactions").select("message_id, user_id").eq("conversation_id", id),
    supabase.rpc("chat_other_read_at", { conv: id }),
    // When the second yes came in, for "Matched …". Read with the admin client:
    // row-level security hides the other side's decision, and only its time is used.
    admin.from("decisions").select("created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const other = profiles.get(otherId);
  const name = other?.name ?? "Your match";
  const [myPhoto = null] = await signPhotoUrls(supabase, ((me?.photos ?? []) as string[]).slice(0, 1));
  const empty = (messages ?? []).length === 0;
  // Conversation starters from the report, while the chat is still young.
  const starters = (messages ?? []).length < 6 ? ((report?.questions_to_ask ?? []) as string[]).slice(0, 4) : [];
  // The twins' take, shown at the top of the chat: the report's first sentence.
  // The Judge writes "Member A / Member B"; here that's "you" and their name.
  const mySide = conversation.user_a === user.id ? "A" : "B";
  const firstSentence = (report?.summary ?? "").match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? report?.summary ?? "";
  const personal = firstSentence
    .replaceAll(`Member ${mySide}`, "you")
    .replaceAll(`Member ${mySide === "A" ? "B" : "A"}`, name);
  const insight = personal ? personal.charAt(0).toUpperCase() + personal.slice(1) : null;
  const matchedAt = (decided?.[0]?.created_at as string | undefined) ?? null;
  const heartRows = (hearts ?? []) as { message_id: number; user_id: string }[];

  return (
    <ChatRoom conversationId={id} userId={user.id}>
      <div className="flex h-[calc(100dvh-8rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <Link
            href="/connections"
            aria-label="Back to connections"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <Avatar name={name} url={other?.photoUrls[0]} className="h-11 w-11 text-base" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight text-black dark:text-zinc-50">{name}</h1>
            <p className="truncate text-xs text-zinc-500">
              {[other?.age != null ? `${other.age}` : null, other?.city, other?.isSeed ? "Demo profile" : null]
                .filter(Boolean)
                .join(" · ")}
              {matchedAt && (
                <>
                  {" · "}
                  <DayText iso={matchedAt} prefix="Matched " />
                </>
              )}
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
            {insight && (
              <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    <path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7L12 2zm7 12l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1 1-2.8z" />
                  </svg>
                  From your twins&apos; first chat
                </p>
                <p className="mt-1 text-sm text-violet-900 dark:text-violet-200">{insight}</p>
              </div>
            )}
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
                conversationId={id}
                otherName={name}
                otherPhotoUrl={other?.photoUrls[0] ?? null}
                seenAt={(seenAt as string | null) ?? null}
                messages={(messages ?? []).map((m) => ({
                  id: m.id,
                  mine: m.sender_id === user.id,
                  content: m.content,
                  createdAt: m.created_at,
                  heartedByMe: heartRows.some((h) => h.message_id === m.id && h.user_id === user.id),
                  heartedByThem: heartRows.some((h) => h.message_id === m.id && h.user_id !== user.id),
                }))}
              />
            )}
          </div>
        </div>

        <ChatComposer conversationId={id} starters={starters} />
        <p className="bg-white px-4 pb-2 text-center text-[11px] text-zinc-400 dark:bg-zinc-950">
          Written by you, not your twin. Double-click a message to heart it.
        </p>
      </div>
    </ChatRoom>
  );
}
