import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadTwinPrompt, runTwinTurn } from "@/lib/agents/twin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// The test chat isn't stored: the browser sends the whole conversation each turn.
// "user" = the person playing a match, "assistant" = the twin.
const BodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(60),
});

// POST { messages } -> { replies: string[] }
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success || body.data.messages[0].role !== "user") {
    return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
  }

  const systemPrompt = await loadTwinPrompt(supabase, user.id);
  if (!systemPrompt) {
    return NextResponse.json({ error: "Your twin isn't built yet." }, { status: 409 });
  }

  try {
    const replies = await runTwinTurn(systemPrompt, body.data.messages);
    return NextResponse.json({ replies });
  } catch (error) {
    console.error("Twin turn failed:", error);
    return NextResponse.json({ error: "Your twin couldn't reply just now. Press Retry." }, { status: 502 });
  }
}
