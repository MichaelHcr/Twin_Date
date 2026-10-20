import { NextResponse } from "next/server";
import { getStripe, isPaidTier, loadSubscription, PLANS } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

// POST { tier: "plus" | "pro" } -> { url } : a Stripe Checkout page (test mode)
// for that plan. The tier is set by the webhook once payment goes through.
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
  if (current.stripe_subscription_id) {
    // One subscription per user: changes and cancelling go through the billing portal.
    return NextResponse.json(
      { error: "You already have a paid plan. Use “Manage billing” to change or cancel it." },
      { status: 409 },
    );
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      client_reference_id: user.id,
      ...(current.stripe_customer_id
        ? { customer: current.stripe_customer_id }
        : { customer_email: user.email }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: PLANS[tier].priceCents,
            recurring: { interval: "month" },
            product_data: {
              name: `Twin Date ${PLANS[tier].name}`,
              description: `${PLANS[tier].perWeek} twin conversations per week`,
            },
          },
        },
      ],
      // The webhook reads these to know whose tier to set.
      subscription_data: { metadata: { user_id: user.id, tier } },
      success_url: `${origin}/pricing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?canceled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Creating a Stripe Checkout session failed:", error);
    return NextResponse.json(
      { error: "Payments aren't available right now. Try again in a minute." },
      { status: 502 },
    );
  }
}
