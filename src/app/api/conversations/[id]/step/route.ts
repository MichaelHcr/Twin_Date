import { NextResponse, type NextRequest } from "next/server";
import { describeAgentError } from "@/lib/agents/errors";
import { judgeConversation } from "@/lib/agents/judge";
import { stepConversation } from "@/lib/agents/orchestrator";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// One twin turn, or the Judge's report, per request.
export const maxDuration = 60;

// POST -> { ended, reported } : moves a conversation forward by one step. The
// match page calls this in a loop while it's open: each call runs the next twin
// turn, and once the chat has ended, one more call writes the Judge's report.
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/conversations/[id]/step">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Row-level security returns the conversation only to its two participants.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, status, end_reason")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  const admin = createAdminClient();
  try {
    if (conversation.status !== "ended") {
      const step = await stepConversation(admin, id);
      const ended = step.status === "already_ended" || (step.status === "turn" && step.ended);
      return NextResponse.json({ ended, reported: false });
    }

    const { data: report } = await admin
      .from("reports")
      .select("conversation_id")
      .eq("conversation_id", id)
      .maybeSingle();
    if (!report && conversation.end_reason !== "error") await judgeConversation(admin, id);
    return NextResponse.json({ ended: true, reported: true });
  } catch (error) {
    console.error("Conversation step failed:", error);
    const { status, message } = describeAgentError(error, "Your twin");
    return NextResponse.json({ error: message }, { status });
  }
}
