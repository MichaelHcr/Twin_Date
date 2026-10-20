import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { DaysAgo } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { loadDecisionStates, loadRevealedProfiles } from "@/lib/decisions";
import { signPhotoUrls } from "@/lib/photos";
import { ensureChatTopics, type ChatTopic } from "@/lib/agents/chat-topics";
import { CHAT_PHOTO_BUCKET } from "@/lib/chat";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_PILL, CARD, COLUMN, PAGE } from "@/lib/ui";
import { ChatComposer } from "./composer";
import { ChatMessages } from "./messages";
import { ChatRoom } from "./room";

// After this many days without a message, the chat offers a topic from the
// twins' report.
const QUIET_AFTER_DAYS = 2;

// Whole days since a time. Pages here render per request, so "now" is the request time.
function daysSince(iso: string | null) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

type ChatRow = { id: number; sender_id: string; content: string; created_at: string; image_path?: string | null };

// The chat's messages, with photo paths once migration 0013 has added the
// column; before that, the same query without it, so the chat still works.
async function loadChatMessages(supabase: SupabaseClient, conversationId: string) {
  const query = (columns: string) =>
    supabase.from("chat_messages").select(columns).eq("conversation_id", conversationId).order("created_at").order("id");
  const withPhotos = await query("id, sender_id, content, created_at, image_path");
  const result = withPhotos.error?.code === "42703" ? await query("id, sender_id, content, created_at") : withPhotos;
  return { data: (result.data ?? null) as ChatRow[] | null, error: result.error };
}

// Person-to-person chat with a connected match (both said yes).
export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <Suspense fallback={<div className={`${CARD} h-[28rem]`} />}>
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
  const [
    profiles,
    { data: messages, error },
    { data: me },
    { data: report },
    { data: hearts },
    { data: seenAt },
    { data: decided },
    { data: twinMessages },
  ] = await Promise.all([
    loadRevealedProfiles(admin, [otherId]),
    loadChatMessages(supabase, id),
    supabase.from("profiles").select("display_name, photos").eq("user_id", user.id).single(),
    supabase.from("reports").select("summary, questions_to_ask").eq("conversation_id", id).maybeSingle(),
    // Hearts and "Seen" need migration 0009; without it these come back empty.
    supabase.from("chat_reactions").select("message_id, user_id").eq("conversation_id", id),
    supabase.rpc("chat_other_read_at", { conv: id }),
    // When the second yes came in, for "Matched …". Read with the admin client:
    // row-level security hides the other side's decision, and only its time is used.
    admin.from("decisions").select("created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(1),
    // The twins' first chat, shown folded above your own messages.
    supabase.from("messages").select("id, speaker, content").eq("conversation_id", id).order("turn").order("id"),
  ]);
  const other = profiles.get(otherId);
  const name = other?.name ?? "Your match";
  const [myPhoto = null] = await signPhotoUrls(supabase, ((me?.photos ?? []) as string[]).slice(0, 1));
  const empty = (messages ?? []).length === 0;
  // Conversation starters from the report, while the chat is still young.
  const questions = (report?.questions_to_ask ?? []) as string[];
  const starters = (messages ?? []).length < 6 ? questions.slice(0, 4) : [];
  // Gone quiet: nobody has written for QUIET_AFTER_DAYS, so offer a topic.
  const quietDays = daysSince((messages ?? []).at(-1)?.created_at ?? null);
  let quiet: { days: number; topics: { intro: string | null; line: string }[] } | null = null;
  const lastMessage = (messages ?? []).at(-1);
  if (lastMessage && quietDays !== null && quietDays >= QUIET_AFTER_DAYS) {
    // Threads the twins started that the two of you haven't picked up. If
    // there are none, no nudge.
    const twinTopics = await ensureChatTopics(admin, id, lastMessage.id).catch((): ChatTopic[] | null => null);
    const mine = conversation.user_a === user.id ? "line_for_a" : "line_for_b";
    if (twinTopics?.length) {
      quiet = {
        days: quietDays,
        topics: twinTopics.map((t) => ({ intro: `Your twins talked about ${t.about}.`, line: t[mine] })),
      };
    }
  }
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
  // Photos sent in the chat, signed for an hour (migration 0013's policies let
  // either person in a connected chat sign its photos).
  const imagePaths = (messages ?? []).flatMap((m) => (m.image_path ? [m.image_path as string] : []));
  const { data: signed } =
    imagePaths.length > 0
      ? await supabase.storage.from(CHAT_PHOTO_BUCKET).createSignedUrls(imagePaths, 60 * 60)
      : { data: [] as { path: string | null; signedUrl: string | null }[] };
  const imageUrlOf = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));

  return (
    <ChatRoom conversationId={id} userId={user.id}>
      <div className={`${CARD} flex h-[calc(100dvh-8rem)] min-h-[28rem] flex-col overflow-hidden`}>
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
            <p className="truncate text-sm text-zinc-500">
              {matchedAt ? <DaysAgo iso={matchedAt} prefix="Matched " /> : "Connected"}
              {other?.isSeed && " · Demo profile"}
            </p>
          </div>
          <Link href={`/matches/${id}`} className={`${BTN_PILL} shrink-0`}>
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
            {(twinMessages ?? []).length > 0 && (
              <TwinsFirstChat
                insight={insight}
                messages={(twinMessages ?? []) as { id: number; speaker: string; content: string }[]}
                mySide={conversation.user_a === user.id ? "a" : "b"}
              />
            )}
            {matchedAt && (
              <div className="my-4 flex items-center gap-3 text-xs text-zinc-400" role="separator">
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                <span>
                  You matched · <DaysAgo iso={matchedAt} />
                </span>
                <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
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
                  Your twins already covered the basics (open their chat above). Say hi, or pick a question below.
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
                  imageUrl: m.image_path ? (imageUrlOf.get(m.image_path) ?? null) : null,
                }))}
              />
            )}
          </div>
        </div>

        <ChatComposer conversationId={id} starters={quiet ? [] : starters} quiet={quiet} />
      </div>
    </ChatRoom>
  );
}

// The twins' first chat, folded above the real one: one line with their
// takeaway, and the full chat when opened. Twins' messages are small, grey and
// labeled, so they can't be mistaken for things you or they actually wrote.
function TwinsFirstChat({
  insight,
  messages,
  mySide,
}: {
  insight: string | null;
  messages: { id: number; speaker: string; content: string }[];
  mySide: "a" | "b";
}) {
  return (
    <details className="group rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="mt-0.5 text-sm text-zinc-400 transition group-open:rotate-90">
          ›
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Your twins&apos; first chat · {messages.length} messages
          </span>
          {insight && <span className="mt-0.5 block text-sm text-violet-700 dark:text-violet-300">✦ {insight}</span>}
        </span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
        {messages.map((m, i) => {
          const mine = m.speaker === mySide;
          const startsRun = messages[i - 1]?.speaker !== m.speaker;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${startsRun && i > 0 ? "mt-2" : ""}`}>
              {startsRun && (
                <span className="mb-0.5 text-[11px] font-medium text-zinc-400">{mine ? "Your twin" : "Their twin"}</span>
              )}
              <span
                className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs leading-snug text-zinc-600 dark:text-zinc-300 ${
                  mine ? "bg-zinc-200 dark:bg-zinc-800" : "bg-white ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
                }`}
              >
                {m.content}
              </span>
            </div>
          );
        })}
        <p className="mt-2 text-center text-[11px] text-zinc-400">Written by your AI twins before you matched</p>
      </div>
    </details>
  );
}
