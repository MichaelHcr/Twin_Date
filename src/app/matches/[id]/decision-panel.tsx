import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { decisionState, loadRevealedProfiles, type DecisionRow, type RevealedProfile } from "@/lib/decisions";
import { createAdminClient } from "@/lib/supabase/admin";
import { DecisionButtons, type DecisionOption } from "./decision-buttons";

const CARD =
  "rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950";

// Under a finished report: Yes / Pass, connection requests, and the reveal once
// both people want to meet. Runs on the server, so the browser only ever learns
// whether they're connected or sent a request, never the other side's yes or pass.
export async function DecisionPanel({
  supabase,
  conversation,
  userId,
}: {
  supabase: SupabaseClient;
  conversation: { id: string; user_a: string; user_b: string; end_reason: string | null };
  userId: string;
}) {
  const { data } = await supabase
    .from("decisions")
    .select("user_id, decision")
    .eq("conversation_id", conversation.id);
  const state = decisionState((data ?? []) as DecisionRow[], userId);

  if (state.connected) {
    const otherId = conversation.user_a === userId ? conversation.user_b : conversation.user_a;
    const profile = (await loadRevealedProfiles(createAdminClient(), [otherId])).get(otherId);
    return profile ? <RevealCard conversationId={conversation.id} profile={profile} /> : null;
  }

  const say = (title: string, body: string, options: DecisionOption[]) => (
    <section className={CARD}>
      <h2 className="font-semibold text-black dark:text-zinc-50">{title}</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
      {options.length > 0 && <DecisionButtons conversationId={conversation.id} options={options} />}
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
  if (state.theyRequested) {
    return say(
      "They'd like to connect",
      state.mine === "pass"
        ? "You passed earlier, but they sent a connection request after reading this report. Accept it and you'll both see who the other is."
        : "They sent a connection request after reading this report. Accept it and you'll both see who the other is.",
      [
        { decision: "yes", label: "Accept", primary: true },
        ...(state.mine === "pass" ? [] : [{ decision: "pass" as const, label: "Pass" }]),
      ],
    );
  }
  if (state.mine === "pass") {
    return say(
      "You passed on this match",
      "Changed your mind? A connection request tells them you'd still like to talk.",
      [{ decision: "request", label: "Send a connection request" }],
    );
  }
  if (conversation.end_reason === "red_flag") {
    return say(
      "This chat ended on a dealbreaker",
      "You can pass, or send a connection request if you'd like to talk anyway. They'll see the request.",
      [
        { decision: "pass", label: "Pass", primary: true },
        { decision: "request", label: "Request to connect anyway" },
      ],
    );
  }
  return say(
    "Would you like to meet?",
    "Your answer stays private. If you both say yes, you'll see each other's name, age and city.",
    [
      { decision: "yes", label: "Yes, I'd like to meet", primary: true },
      { decision: "pass", label: "Pass" },
    ],
  );
}

function RevealCard({ conversationId, profile }: { conversationId: string; profile: RevealedProfile }) {
  return (
    <section className="rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950">
      <p className="text-sm font-medium text-green-700 dark:text-green-400">You both said yes</p>
      <div className="mt-3 flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-green-800 dark:bg-black dark:text-green-300">
          {profile.name.charAt(0).toUpperCase()}
        </span>
        <div>
          <p className="text-xl font-semibold text-black dark:text-zinc-50">
            {profile.name}
            {profile.age !== null && <span className="font-normal text-zinc-600 dark:text-zinc-400">, {profile.age}</span>}
          </p>
          {profile.city && <p className="text-sm text-zinc-600 dark:text-zinc-400">{profile.city}</p>}
        </div>
      </div>
      {profile.isSeed && (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-xs text-zinc-600 dark:bg-black dark:text-zinc-400">
          Demo profile: this member is synthetic, and their yes was simulated from the report&apos;s score.
        </p>
      )}
      <Link
        href={`/chat/${conversationId}`}
        className="mt-4 inline-block rounded-full bg-black px-5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Open chat
      </Link>
      <p className="mt-4 text-xs text-zinc-500">Only the two of you can see each other&apos;s details.</p>
    </section>
  );
}
