import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe calls this after checkout and whenever a subscription changes. The
// signature check proves the request came from Stripe, so nobody can upgrade
// themselves by posting here.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    // The signature covers the raw body, so read it as text before parsing.
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let subscriptionId: string | null = null;
  switch (event.type) {
    case "checkout.session.completed": {
      const sub = event.data.object.subscription;
      subscriptionId = typeof sub === "string" ? sub : (sub?.id ?? null);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      subscriptionId = event.data.object.id;
      break;
  }
  if (!subscriptionId) return NextResponse.json({ received: true });

  try {
    await syncSubscription(stripe, createAdminClient(), subscriptionId);
  } catch (error) {
    // A 500 makes Stripe retry the event later.
    console.error(`Handling Stripe event ${event.id} (${event.type}) failed:`, error);
    return NextResponse.json({ error: "Couldn't process the event." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
