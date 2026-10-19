import { NextResponse } from "next/server";
import { buildPersona } from "@/lib/agents/persona-builder";
import { createClient } from "@/lib/supabase/server";
import { describeAgentError } from "@/lib/agents/errors";

// Building a persona card reads the whole interview, so allow up to two minutes.
export const maxDuration = 120;

// POST -> { persona } : builds a new version of the signed-in user's persona card.
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

  try {
    const persona = await buildPersona(supabase, user.id);
    return NextResponse.json({ persona });
  } catch (error) {
    console.error("Persona build failed:", error);
    const { status, message } = describeAgentError(error, "The Persona Builder");
    return NextResponse.json({ error: message }, { status });
  }
}
