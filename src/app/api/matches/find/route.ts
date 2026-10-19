import { NextResponse } from "next/server";
import { describeAgentError } from "@/lib/agents/errors";
import { conversationsThisWeek, loadSubscription, PLANS } from "@/lib/billing";
import { createConversation } from "@/lib/agents/orchestrator";
import { scoutMatches } from "@/lib/agents/scout";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Ranking candidates is one model call.
export const maxDuration = 60;

// POST -> { conversationId } : the Scout picks the user's next match and queues a
// twin conversation with them. If a conversation is still unfinished, returns that
// one instead, so a user runs one chat at a time.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("user_id", user.id)
    .single();
  if (!profile?.onboarding_complete) {
    return NextResponse.json({ error: "Finish your interview first." }, { status: 409 });
  }

  const { data: open } = await supabase
    .from("conversations")
    .select("id")
    .neq("status", "ended")
    .limit(1)
    .maybeSingle();
  if (open) return NextResponse.json({ conversationId: open.id });

  // The plan's weekly quota (PRD: Auth, payments and publishing).
  const { tier } = await loadSubscription(supabase, user.id);
  const used = await conversationsThisWeek(supabase, user.id);
  if (used >= PLANS[tier].perWeek) {
    return NextResponse.json(
      {
        error: `You've used all ${PLANS[tier].perWeek} twin chats on the ${PLANS[tier].name} plan in the last 7 days.`,
        upgrade: tier !== "pro",
      },
      { status: 402 },
    );
  }

  try {
    const admin = createAdminClient();
    const [match] = await scoutMatches(admin, user.id, 1);
    if (!match) {
      return NextResponse.json(
        { error: "No new matches right now. Check back when more people join." },
        { status: 404 },
      );
    }
    const conversationId = await createConversation(admin, user.id, match.userId);
    return NextResponse.json({ conversationId });
  } catch (error) {
    console.error("Finding a match failed:", error);
    const { status, message } = describeAgentError(error, "The Scout");
    return NextResponse.json({ error: message }, { status });
  }
}
