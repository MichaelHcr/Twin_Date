import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { cache } from "react";
import { Avatar } from "@/components/avatar";
import { loadDecisionStates, loadRevealedProfiles, NO_DECISION, wantsToMeet, type RevealedProfile } from "@/lib/decisions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BTN_PRIMARY, CARD, DOT_ALERT, STORY_RING } from "@/lib/ui";
import { DecisionButtons, type DecisionOption } from "./decision-buttons";

type Conversation = { id: string; user_a: string; user_b: string; end_reason: string | null };


// Both parts of the page read the same state; cache() makes it one query per request.
const loadState = cache(async (supabase: SupabaseClient, conversationId: string) => {
  return (await loadDecisionStates(supabase, conversationId)).get(conversationId) ?? NO_DECISION;
});

// The Yes / Pass choice is still open: either nothing decided yet, or they sent a
// request that this user hasn't accepted.
const needsAnswer = (state: Awaited<ReturnType<typeof loadState>>) =>
  !state.connected && !wantsToMeet(state.mine) && (state.mine === null || state.theyRequested);

// Above the report: the reveal once both people want to meet, or where things
// stand after this user has answered. Row-level security and
// public.decision_states (migration 0007) only ever tell a user whether they're
// connected or the other side sent a request, never the other side's yes or pass.
export async function DecisionStatus({
  supabase,
  conversation,
  userId,
}: {
  supabase: SupabaseClient;
  conversation: Conversation;
  userId: string;
}) {
  const state = await loadState(supabase, conversation.id);

  if (state.connected) {
    const otherId = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
    const profile = (await loadRevealedProfiles(createAdminClient(), [otherId])).get(otherId);
    return profile ? <RevealCard conversationId={conversation.id} profile={profile} /> : null;
  }
  if (needsAnswer(state)) return null; // DecisionBar asks at the bottom of the screen.

  const say = (title: string, body: string, options: DecisionOption[]) => (
    <section className={`${CARD} p-6`}>
      <h2 className="font-semibold text-black dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
      <DecisionButtons conversationId={conversation.id} options={options} />
    </section>
  );

  if (state.mine === "yes") {
    return say(
      "You said yes",
      "If they say yes too, you'll both see who the other is. Until then, your answer stays private.",
      [{ decision: "pass", label: "Change to pass" }],
    );
  }
  if (state.mine === "request") {
    return say(
      "Connection request sent",
      "They'll see your request on this report. If they accept, you'll both see who the other is.",
      [{ decision: "pass", label: "Withdraw request" }],
    );
  }
  return say(
    "You passed on this match",
    "Changed your mind? A connection request tells them you'd still like to talk.",
    [{ decision: "request", label: "Send a connection request" }],
  );
}

// While the choice is open, a bar stays pinned to the bottom of the screen, so
// Yes / Pass is visible while reading the report and the transcript.
export async function DecisionBar({
  supabase,
  conversation,
}: {
  supabase: SupabaseClient;
  conversation: Conversation;
}) {
  const state = await loadState(supabase, conversation.id);
  if (!needsAnswer(state)) return null;

  let title = "Would you like to meet?";
  let body = "Your answer stays private. If you both say yes, you'll see each other's name, photos and city.";
  let options: DecisionOption[] = [
    { decision: "yes", label: "Yes, I'd like to meet", primary: true },
    { decision: "pass", label: "Pass" },
  ];
  if (state.theyRequested) {
    title = "They'd like to connect";
    body =
      state.mine === "pass"
        ? "You passed earlier, but they sent a connection request after reading this report."
        : "They sent a connection request after reading this report. Accept it and you'll both see who the other is.";
    options = [
      { decision: "yes", label: "Accept", primary: true },
      ...(state.mine === "pass" ? [] : [{ decision: "pass" as const, label: "Pass" }]),
    ];
  } else if (conversation.end_reason === "red_flag") {
    title = "This chat ended on a dealbreaker";
    body = "You can pass, or send a connection request if you'd like to talk anyway. They'll see the request.";
    options = [
      { decision: "pass", label: "Pass", primary: true },
      { decision: "request", label: "Request to connect anyway" },
    ];
  }

  return (
    <section className={`${CARD} sticky bottom-4 z-10 p-4 shadow-lg`}>
      <p className="flex items-center gap-2 font-semibold text-black dark:text-zinc-50">
        <span className={DOT_ALERT} aria-hidden />
        {title}
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
      <DecisionButtons conversationId={conversation.id} options={options} className="mt-3" />
    </section>
  );
}

function RevealCard({ conversationId, profile }: { conversationId: string; profile: RevealedProfile }) {
  return (
    <section className={`${CARD} p-6`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-black dark:text-zinc-50">
        <span aria-hidden className="text-brand">
          ♥
        </span>
        You both said yes
      </p>
      <div className="mt-3 flex items-center gap-4">
        <span className={STORY_RING}>
          <span className="block rounded-full bg-white p-[2px] dark:bg-zinc-950">
            <Avatar name={profile.name} url={profile.photoUrls[0]} className="h-16 w-16 text-xl" />
          </span>
        </span>
        <div>
          <p className="text-xl font-semibold text-black dark:text-zinc-50">
            {profile.name}
            {profile.age !== null && <span className="font-normal text-zinc-600 dark:text-zinc-400">, {profile.age}</span>}
          </p>
          {profile.city && <p className="text-sm text-zinc-600 dark:text-zinc-400">{profile.city}</p>}
        </div>
      </div>
      {profile.photoUrls.length > 1 && (
        <ul className="mt-4 grid grid-cols-3 gap-2">
          {profile.photoUrls.slice(1).map((url, i) => (
            <li key={url}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${profile.name}, photo ${i + 2}`} className="aspect-[4/5] w-full rounded-xl object-cover" />
            </li>
          ))}
        </ul>
      )}
      {profile.isSeed && (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs text-zinc-600 dark:bg-black dark:text-zinc-400">
          Demo profile: this member is synthetic, and their yes was simulated from the report&apos;s score.
        </p>
      )}
      <Link
        href={`/chat/${conversationId}`}
        className={`${BTN_PRIMARY} mt-4`}
      >
        Open chat
      </Link>
      <p className="mt-4 text-xs text-zinc-500">Only the two of you can see each other&apos;s details and photos.</p>
    </section>
  );
}
