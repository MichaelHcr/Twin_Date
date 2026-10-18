import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { runInterviewerTurn } from "@/lib/agents/interviewer";
import { createClient } from "@/lib/supabase/server";
import { describeAgentError } from "@/lib/agents/errors";

// An interview turn can take several model calls (tool use), so allow up to a minute.
export const maxDuration = 60;

// One reply from the user can be several chat messages, like texting in bursts.
const BodySchema = z.object({
  messages: z.array(z.string().trim().min(1).max(2000)).max(10).default([]),
});

// POST { messages: string[] } -> { reply, done }
// With no messages it either starts the interview (empty history) or retries a
// turn whose reply failed (last stored message is the user's).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json(
      { error: "Please send up to 10 messages of at most 2000 characters each." },
      { status: 400 },
    );
  }
  const newMessages = body.data.messages;

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_complete")
    .eq("user_id", user.id)
    .single();
  if (profile?.onboarding_complete) {
    return NextResponse.json({ error: "Your interview is already complete." }, { status: 409 });
  }

  const { data: rows, error: historyError } = await supabase
    .from("interview_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("id", { ascending: true });
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });

  const history = rows ?? [];
  if (newMessages.length === 0 && history.length > 0 && history.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }

  if (newMessages.length > 0) {
    // Saved before calling the model, so the answer isn't lost if the model call fails.
    // Each message is its own row, which keeps how the user splits their texts.
    const { error } = await supabase
      .from("interview_messages")
      .insert(newMessages.map((content) => ({ user_id: user.id, role: "user", content })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    history.push(...newMessages.map((content) => ({ role: "user", content })));
  }

  try {
    const { reply, done } = await runInterviewerTurn({ supabase, userId: user.id, history });
    await supabase.from("interview_messages").insert({ user_id: user.id, role: "assistant", content: reply });
    return NextResponse.json({ reply, done });
  } catch (error) {
    console.error("Interviewer turn failed:", error);
    const { status, message } = describeAgentError(error, "The interviewer");
    return NextResponse.json({ error: message }, { status });
  }
}
