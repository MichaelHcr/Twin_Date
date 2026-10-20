import { NextResponse } from "next/server";
import Stripe from "stripe";
import { changePlan, getStripe, isPaidTier, loadSubscription } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// POST { tier: "plus" | "pro" } -> { ok } : switches a paying user to the other
// paid plan. Free users go through Checkout; cancelling goes through the portal.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body: { tier?: unknown } = await request.json().catch(() => ({}));
  const tier = body.tier;
  if (!isPaidTier(tier)) {
    return NextResponse.json({ error: "Choose Plus or Pro." }, { status: 400 });
  }

  const current = await loadSubscription(supabase, user.id);
  if (!current.stripe_subscription_id) {
    return NextResponse.json({ error: "You don't have a paid plan yet. Choose one to subscribe." }, { status: 409 });
  }
  if (current.tier === tier) {
    return NextResponse.json({ error: "You're already on this plan." }, { status: 409 });
  }

  try {
    await changePlan(getStripe(), createAdminClient(), current.stripe_subscription_id, tier);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Changing the plan failed:", error);
    if (error instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json(
        { error: "Your card was declined, so your plan wasn't changed. Update your card in “Manage billing”." },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: "Your plan couldn't be changed right now. Try again in a minute." },
      { status: 502 },
    );
  }
}
